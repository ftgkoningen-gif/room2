/**
 * Test script - draait price-checker of youtube-monitor logica direct
 * Usage:
 *   node --env-file=.env --import tsx test-run.ts              (price checker)
 *   node --env-file=.env --import tsx test-run.ts --youtube     (youtube monitor)
 */
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import products from "./src/trigger/products.json";

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

interface Offer {
  productName: string;
  supermarket: string;
  currentPrice: number;
  originalPrice: number | null;
  effectivePrice: number;
  discountLabel: string | null;
  discountPeriod: string | null;
  isOnSale: boolean;
  productUrl: string | null;
  weightGrams: number | null;
  pricePerKg: number | null;
}

interface ProductResult {
  name: string;
  offers: Offer[];
  errors: string[];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Effectieve prijs berekening ---

function calcEffectivePrice(price: number, label: string | null): number {
  if (!label) return price;
  const l = label.toLowerCase();
  if (l.includes("1+1") || l.includes("2e gratis")) return price / 2;
  if (l.includes("2e halve prijs") || l.includes("2e 50%")) return (price + price / 2) / 2;
  if (l.includes("3+2 gratis") || l.includes("3 + 2 gratis")) return (price * 3) / 5;
  if (l.includes("2+1 gratis") || l.includes("2 + 1 gratis")) return (price * 2) / 3;
  const pct = l.match(/(\d+)%\s*korting/);
  if (pct) return price * (1 - parseInt(pct[1]) / 100);
  return price;
}

// --- Datumlogica ---

function getOfferDateRange(): { from: string; to: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(tomorrow);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return { from: tomorrow.toISOString().slice(0, 10), to: weekEnd.toISOString().slice(0, 10) };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// --- Gewicht parsing ---

function parseWeightGrams(productName: string): number | null {
  const name = productName.toLowerCase();
  const kgMatch = name.match(/(\d+[.,]?\d*)\s*(kg|kilo)/);
  if (kgMatch) return Math.round(parseFloat(kgMatch[1].replace(",", ".")) * 1000);
  const gMatch = name.match(/(\d+)\s*(g|gr|gram)\b/);
  if (gMatch) return parseInt(gMatch[1]);
  const lMatch = name.match(/(\d+[.,]?\d*)\s*(l|liter|lt)\b/);
  if (lMatch) return Math.round(parseFloat(lMatch[1].replace(",", ".")) * 1000);
  const mlMatch = name.match(/(\d+)\s*(ml|cl)\b/);
  if (mlMatch) {
    const val = parseInt(mlMatch[1]);
    return mlMatch[2] === "cl" ? val * 10 : val;
  }
  return null;
}

function enrichWithWeight(offer: Offer): Offer {
  const w = parseWeightGrams(offer.productName);
  return {
    ...offer,
    weightGrams: w,
    pricePerKg: w && w > 0 ? Math.round((offer.effectivePrice / w) * 1000 * 100) / 100 : null,
  };
}

// --- Filter & helpers ---

function filterOffers(offers: Offer[], brand: string, titleContains: string[], titleExcludes?: string[]): Offer[] {
  return offers.filter((o) => {
    const title = o.productName.toLowerCase();
    if (!title.includes(brand.toLowerCase())) return false;
    for (const tc of titleContains) {
      const alternatives = tc.toLowerCase().split("|");
      if (!alternatives.some((alt) => title.includes(alt))) return false;
    }
    if (titleExcludes) {
      for (const te of titleExcludes) {
        const alternatives = te.toLowerCase().split("|");
        if (alternatives.some((alt) => title.includes(alt))) return false;
      }
    }
    return true;
  });
}

function bestPerSupermarket(offers: Offer[]): Offer[] {
  const bySuper = new Map<string, Offer>();
  for (const o of offers) {
    if (o.effectivePrice <= 0) continue;
    const existing = bySuper.get(o.supermarket);
    if (!existing || o.effectivePrice < existing.effectivePrice) {
      bySuper.set(o.supermarket, o);
    }
  }
  return Array.from(bySuper.values());
}

// --- Albert Heijn API ---

async function getAhToken(): Promise<string> {
  const res = await fetch("https://api.ah.nl/mobile-auth/v1/auth/token/anonymous", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "appie" }),
  });
  return (await res.json()).access_token;
}

async function searchAh(query: string, token: string): Promise<Offer[]> {
  const res = await fetch(`https://api.ah.nl/mobile-services/product/search/v2?query=${encodeURIComponent(query)}&sortOn=RELEVANCE&size=10`, {
    headers: { Authorization: `Bearer ${token}`, "x-application": "AHWEBSHOP" },
  });
  const data = await res.json();
  const { from, to } = getOfferDateRange();
  return (data.products || []).map((p: any) => {
    const bonusStart = p.bonusStartDate || "";
    const bonusEnd = p.bonusEndDate || "";
    const isOnSale = p.isBonus === true && bonusStart <= to && bonusEnd >= from;
    const discountLabel = isOnSale ? `Bonus: ${p.bonusMechanism || "aanbieding"}` : null;
    const discountPeriod = isOnSale ? `${formatDate(bonusStart)} t/m ${formatDate(bonusEnd)}` : null;
    const price = p.priceBeforeBonus || 0;
    const slug = (p.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const productUrl = p.webshopId ? `https://www.ah.nl/producten/product/wi${p.webshopId}/${slug}` : null;
    const productName = p.salesUnitSize && !p.title.toLowerCase().includes(p.salesUnitSize.toLowerCase().replace(/\s/g, "")) ? `${p.title} ${p.salesUnitSize}` : p.title;
    return { productName, supermarket: "Albert Heijn", currentPrice: price, originalPrice: isOnSale ? price : null, effectivePrice: isOnSale ? calcEffectivePrice(price, discountLabel) : price, discountLabel, discountPeriod, isOnSale, productUrl };
  });
}

// --- Jumbo GraphQL API ---

const JUMBO_GQL = "fragment Product on Product { title id link price { price promoPrice } promotions { active tags { text } start { date } end { date } } brand } query SearchProductsOverview($input: ProductSearchInput!, $fetchSearchProducts: Boolean!, $skus: [String!]!, $fetchProducts: Boolean!) { searchProducts(input: $input) @include(if: $fetchSearchProducts) { products { ...Product } } products(skus: $skus) @include(if: $fetchProducts) { ...Product } }";

async function searchJumbo(query: string): Promise<Offer[]> {
  const res = await fetch("https://www.jumbo.com/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apollographql-client-name": "JUMBO_WEB",
      "apollographql-client-version": "master-v30.5.0-web",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      operationName: "SearchProductsOverview",
      variables: {
        input: { searchTerms: query, limit: 10, searchType: "keyword" },
        fetchSearchProducts: true, fetchProducts: false, skus: [""],
      },
      query: JUMBO_GQL,
    }),
  });
  if (!res.ok) throw new Error(`Jumbo search failed: ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(`Jumbo GraphQL: ${data.errors[0].message}`);

  return (data.data?.searchProducts?.products || []).map((p: any) => {
    const price = p.price.price / 100;
    const promoPrice = p.price.promoPrice ? p.price.promoPrice / 100 : null;
    const activePromo = (p.promotions || []).find((pr: any) => pr.active);

    let isOnSale = false;
    let discountLabel: string | null = null;
    let discountPeriod: string | null = null;

    if (activePromo) {
      isOnSale = true;
      discountLabel = activePromo.tags?.map((t: any) => t.text).join(", ") || "Aanbieding";
      if (activePromo.start?.date && activePromo.end?.date) {
        discountPeriod = `${activePromo.start.date} t/m ${activePromo.end.date}`;
      }
    } else if (promoPrice && promoPrice < price) {
      isOnSale = true;
      discountLabel = "Aanbieding";
    }

    let effectivePrice = price;
    if (promoPrice && promoPrice < price) {
      effectivePrice = promoPrice;
    } else if (isOnSale && discountLabel) {
      effectivePrice = calcEffectivePrice(price, discountLabel);
    }

    return {
      productName: p.title,
      supermarket: "Jumbo",
      currentPrice: price,
      originalPrice: isOnSale ? price : null,
      effectivePrice,
      discountLabel,
      discountPeriod,
      isOnSale,
      productUrl: p.link ? `https://www.jumbo.com${p.link}` : null,
    };
  });
}

// --- Dirk GraphQL API ---

const DIRK_API = "https://web-gateway.dirk.nl/graphql";
const DIRK_KEY = "6d3a42a3-6d93-4f98-838d-bcc0ab2307fd";
const DIRK_STORE = 66;

async function searchDirk(query: string): Promise<Offer[]> {
  const safeQuery = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // Stap 1: zoek product-IDs
  const searchRes = await fetch(DIRK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": DIRK_KEY },
    body: JSON.stringify({
      query: `{ searchProducts(search: "${safeQuery}", limit: 10) { products { product { productId brand headerText packaging department webgroup } } } }`,
    }),
  });
  if (!searchRes.ok) throw new Error(`Dirk search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const found = searchData?.data?.searchProducts?.products || [];
  if (found.length === 0) return [];

  const ids = found.map((p: any) => p.product.productId);
  const slugify = (s: string) => s.toLowerCase().replace(/[&]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const productMeta = new Map(found.map((p: any) => [p.product.productId, p.product]));

  // Stap 2: haal prijzen op
  const priceRes = await fetch(DIRK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": DIRK_KEY },
    body: JSON.stringify({
      query: `{ products(productIds: [${ids.join(",")}], storeId: ${DIRK_STORE}) { productId normalPrice offerPrice startDate endDate productInformation { brand headerText packaging } productOffer { textPriceSign startDate endDate } } }`,
    }),
  });
  if (!priceRes.ok) throw new Error(`Dirk price fetch failed: ${priceRes.status}`);
  const priceData = await priceRes.json();
  const { from, to } = getOfferDateRange();

  return (priceData?.data?.products || []).filter((p: any) => p && p.productInformation).map((p: any) => {
    const info = p.productInformation;
    const normalPrice = p.normalPrice || 0;
    const offerPrice = p.offerPrice || 0;

    let isOnSale = false;
    let discountLabel: string | null = null;
    let discountPeriod: string | null = null;

    if (offerPrice > 0 && p.startDate && p.endDate) {
      const start = p.startDate.slice(0, 10);
      const end = p.endDate.slice(0, 10);
      if (start <= to && end >= from) {
        isOnSale = true;
        discountLabel = p.productOffer?.textPriceSign || "Aanbieding";
        discountPeriod = `${formatDate(start)} t/m ${formatDate(end)}`;
      }
    }

    return {
      productName: `${info.headerText} (${info.packaging})`,
      supermarket: "Dirk",
      currentPrice: normalPrice,
      originalPrice: isOnSale ? normalPrice : null,
      effectivePrice: isOnSale ? offerPrice : normalPrice,
      discountLabel,
      discountPeriod,
      isOnSale,
      productUrl: (() => {
        const meta = productMeta.get(p.productId);
        if (meta?.department && meta?.webgroup) {
          return `https://www.dirk.nl/boodschappen/${slugify(meta.department)}/${slugify(meta.webgroup)}/${encodeURIComponent(info.headerText.toLowerCase())}/${p.productId}`;
        }
        return `https://www.dirk.nl/boodschappen?q=${encodeURIComponent(query)}`;
      })(),
    };
  });
}

// --- Vomar REST API ---

async function searchVomar(query: string): Promise<Offer[]> {
  const res = await fetch(`https://api.vomar.nl/api/v1/article/search?searchString=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Vomar fetch failed: ${res.status}`);
  const data = await res.json();

  return (data || []).map((p: any) => {
    const price = p.price || 0;
    const defaultPrice = p.priceDefaultAmount || price;
    const isOnSale = p.discountDeal === true || (defaultPrice > price && price > 0);
    const discountLabel = isOnSale ? "Aanbieding" : null;

    return {
      productName: p.detailedDescription || p.description || "",
      supermarket: "Vomar",
      currentPrice: defaultPrice,
      originalPrice: isOnSale ? defaultPrice : null,
      effectivePrice: price,
      discountLabel,
      discountPeriod: null,
      isOnSale,
      productUrl: `https://www.vomar.nl/assortiment?q=${encodeURIComponent(query)}`,
    };
  });
}

// --- Aldi categorie API ---

async function searchAldi(category: string): Promise<Offer[]> {
  const res = await fetch(`https://webservice.aldi.nl/api/v1/products/${category}.json`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Aldi fetch failed: ${res.status}`);
  const data = await res.json();

  const offers: Offer[] = [];
  for (const group of (data.articleGroups || [])) {
    for (const a of (group.articles || [])) {
      if (!a.price || a.showPrice === false) continue;
      const price = parseFloat(a.price);
      if (isNaN(price) || price <= 0) continue;

      const oldPrice = a.oldPrice ? parseFloat(a.oldPrice) : null;
      const isOnSale = oldPrice !== null && oldPrice > price;
      const discountLabel = isOnSale ? (a.priceReduction || "Aanbieding") : null;

      offers.push({
        productName: a.productName || a.title || "",
        supermarket: "Aldi",
        currentPrice: oldPrice && isOnSale ? oldPrice : price,
        originalPrice: isOnSale ? oldPrice : null,
        effectivePrice: price,
        discountLabel,
        discountPeriod: null,
        isOnSale,
        productUrl: a.url ? `https://www.aldi.nl${a.url}` : "https://www.aldi.nl/sortiment.html",
      });
    }
  }
  return offers;
}

// --- Holland & Barrett (HTML scrape) ---

async function searchHollandBarrett(categoryPath: string, query: string): Promise<Offer[]> {
  const url = `https://www.hollandandbarrett.nl/shop/${categoryPath}/?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`H&B fetch failed: ${res.status}`);
  const html = await res.text();

  const offers: Offer[] = [];
  const tilesMarker = '"tiles":';
  let searchFrom = 0;

  while (true) {
    const idx = html.indexOf(tilesMarker, searchFrom);
    if (idx === -1) break;
    const bracketStart = html.indexOf("[", idx + tilesMarker.length);
    if (bracketStart === -1) break;

    let depth = 0;
    let end = bracketStart;
    for (let i = bracketStart; i < html.length; i++) {
      if (html[i] === "[") depth++;
      if (html[i] === "]") depth--;
      if (depth === 0) { end = i; break; }
    }
    searchFrom = end + 1;

    const tilesJson = html.substring(bracketStart, end + 1);
    if (tilesJson === "[]") continue;

    try {
      const tiles = JSON.parse(tilesJson);

      for (const tile of tiles) {
        const productTitle = tile.title || "";
        const brandName = tile.brandName || tile.name || "";
        const fullName = brandName && productTitle ? `${brandName} ${productTitle}` : productTitle || brandName;
        if (!fullName) continue;

        const actualPriceStr = (tile.actualPrice || "").replace(/[€\s\u20AC]/g, "").replace(",", ".");
        const retailPriceStr = (tile.retailPrice || "").replace(/[€\s\u20AC]/g, "").replace(",", ".");

        const actualPrice = parseFloat(actualPriceStr);
        const retailPrice = parseFloat(retailPriceStr);
        if (isNaN(actualPrice) || actualPrice <= 0) continue;

        const hasDiscount = tile.showRetailPrice && !isNaN(retailPrice) && retailPrice > actualPrice;
        const promotion = tile.promotion || null;

        let discountLabel: string | null = null;
        if (promotion) {
          discountLabel = promotion;
        } else if (hasDiscount && tile.discountPercentage) {
          discountLabel = `${tile.discountPercentage}% korting`;
        } else if (hasDiscount) {
          const pct = Math.round((1 - actualPrice / retailPrice) * 100);
          discountLabel = `${pct}% korting`;
        }

        const effectivePrice = promotion
          ? calcEffectivePrice(actualPrice, promotion)
          : actualPrice;

        const productUrl = tile.url
          ? `https://www.hollandandbarrett.nl${tile.url}`
          : null;

        offers.push({
          productName: fullName,
          supermarket: "Holland & Barrett",
          currentPrice: hasDiscount ? retailPrice : actualPrice,
          originalPrice: hasDiscount ? retailPrice : null,
          effectivePrice,
          discountLabel,
          discountPeriod: null,
          isOnSale: hasDiscount || !!promotion,
          productUrl,
          weightGrams: null,
          pricePerKg: null,
        });
      }
    } catch {
      // JSON parse failed, skip
    }
  }

  return offers;
}

// --- Main ---

async function main() {
  const { from, to } = getOfferDateRange();
  console.log("=== Price Hunter Test Run ===");
  console.log(`Aanbiedingen periode: ${from} t/m ${to}\n`);

  const ahToken = await getAhToken();
  console.log("AH API token OK\n");

  const results: ProductResult[] = [];

  for (const product of products) {
    console.log(`━━━ ${product.name} ━━━`);
    const errors: string[] = [];
    let allOffers: Offer[] = [];

    // AH
    if (product.ah) {
      try {
        const ah = await searchAh(product.ah.query, ahToken);
        const filtered = filterOffers(ah, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  AH: ${ah.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  AH FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Jumbo
    if (product.jumbo) {
      await delay(1500);
      try {
        const jumbo = await searchJumbo(product.jumbo.query);
        const filtered = filterOffers(jumbo, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  Jumbo: ${jumbo.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  Jumbo FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Dirk
    if (product.dirk) {
      try {
        const dirk = await searchDirk(product.dirk.query);
        const filtered = filterOffers(dirk, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  Dirk: ${dirk.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  Dirk FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Aldi
    if ((product as any).aldi) {
      try {
        const aldi = await searchAldi((product as any).aldi.category);
        const filtered = filterOffers(aldi, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  Aldi: ${aldi.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  Aldi FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Vomar
    if ((product as any).vomar) {
      try {
        const vomar = await searchVomar((product as any).vomar.query);
        const filtered = filterOffers(vomar, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  Vomar: ${vomar.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  Vomar FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Holland & Barrett
    if ((product as any).hb) {
      try {
        const hbConfig = (product as any).hb;
        const hb = await searchHollandBarrett(hbConfig.category, hbConfig.query);
        const filtered = filterOffers(hb, product.brand, product.titleContains, product.titleExcludes);
        console.log(`  H&B: ${hb.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  H&B FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Enrich with weight data
    allOffers = allOffers.map(enrichWithWeight);

    // Resultaten per supermarkt
    const best = bestPerSupermarket(allOffers);
    if (best.length > 0) {
      console.log(`\n  Beste prijs per supermarkt:`);
      for (const o of best.sort((a, b) => a.effectivePrice - b.effectivePrice)) {
        const perKg = o.pricePerKg ? ` (€${o.pricePerKg.toFixed(2)}/kg, ${o.weightGrams}g)` : "";
        console.log(`    ${o.supermarket} — €${o.effectivePrice.toFixed(2)}/stuk${perKg}${o.isOnSale ? ` (${o.discountLabel})` : " (regulier)"}${o.discountPeriod ? ` | ${o.discountPeriod}` : ""}${o.productUrl ? `\n      → ${o.productUrl}` : ""}`);
      }
      const cheapest = best.reduce((a, b) => a.effectivePrice < b.effectivePrice ? a : b);
      console.log(`\n  >>> GOEDKOOPST: ${cheapest.supermarket} — €${cheapest.effectivePrice.toFixed(2)}/stuk`);
    } else {
      console.log(`\n  Geen resultaten gevonden.`);
    }

    console.log();
    results.push({ name: product.name, offers: allOffers, errors });
  }

  // Supabase opslag
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = getWeekNumber(tomorrow);
  const year = tomorrow.getFullYear();

  if (supabase) {
    console.log(`--- Opslaan in Supabase ---`);
    const rows = [];
    for (const r of results) {
      const best = bestPerSupermarket(r.offers);
      for (const offer of best) {
        rows.push({
          week_number: week, year,
          product_name: r.name, supermarket: offer.supermarket,
          current_price: offer.currentPrice, original_price: offer.originalPrice,
          effective_price: offer.effectivePrice, discount_label: offer.discountLabel,
          discount_period: offer.discountPeriod, is_on_sale: offer.isOnSale,
          product_url: offer.productUrl,
          weight_grams: offer.weightGrams, price_per_kg: offer.pricePerKg,
        });
      }
    }
    const { error: sbErr } = await supabase
      .from("price_checks")
      .upsert(rows, { onConflict: "year,week_number,product_name,supermarket" });
    if (sbErr) console.error("Supabase FOUT:", sbErr);
    else console.log(`${rows.length} prijzen opgeslagen in Supabase`);
  } else {
    console.log(`--- Supabase niet geconfigureerd, opslag overgeslagen ---`);
  }

  // Email
  const emailTo = process.env.EMAIL_TO || "koningen@proton.me";
  console.log(`--- E-mail naar ${emailTo} ---`);
  const emailHtml = buildEmailHtml(results);
  try {
    const { data, error } = await resend.emails.send({
      from: `Price Hunter <${process.env.EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: [emailTo], subject: `Price Hunter — Prijsupdate week ${week} (TEST)`, html: emailHtml,
    });
    if (error) console.error("MISLUKT:", error);
    else console.log(`VERSTUURD! ID: ${data?.id}`);
  } catch (e) { console.error("ERROR:", e); }
}

// --- Email helpers ---

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function buildEmailHtml(results: ProductResult[]): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = getWeekNumber(tomorrow);

  const totalProducts = results.length;
  const totalOffers = results.reduce((sum, r) => sum + r.offers.filter((o) => o.isOnSale).length, 0);

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h1 style="color:#FF7300;font-size:24px;border-bottom:2px solid #FF7300;padding-bottom:10px;">Price Hunter — Week ${week}</h1>
    <p style="color:#333;font-size:16px;line-height:1.6;">
      De prijzen van deze week zijn bijgewerkt. Er zijn <strong>${totalProducts} producten</strong> gecheckt
      bij Albert Heijn, Jumbo, Dirk, Aldi en Vomar${totalOffers > 0 ? `, waarvan <strong>${totalOffers} aanbiedingen</strong>` : ""}.
    </p>
    <p style="margin:24px 0;">
      <a href="https://pricehunter-six.vercel.app/" style="display:inline-block;padding:12px 24px;background:#FF7300;color:#fff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;" target="_blank">
        Bekijk alle prijzen
      </a>
    </p>
    <p style="font-size:12px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:10px;">
      Automatisch verstuurd door Price Hunter
    </p>
  </div>`;
}

// --- YouTube Monitor ---

import Anthropic from "@anthropic-ai/sdk";
import { YoutubeTranscript } from "youtube-transcript-plus";
import channelsConfig from "./src/trigger/channels.json";

interface YTChannelConfig {
  name: string;
  channelId: string;
  uploadsPlaylistId: string;
}
interface YTCategoryConfig {
  name: string;
  emoji: string;
  channels: YTChannelConfig[];
}
interface YTVideoInfo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  category: string;
  publishedAt: string;
  thumbnailUrl: string;
  videoUrl: string;
}
interface YTVideoWithSummary extends YTVideoInfo {
  summary: string | null;
  transcriptAvailable: boolean;
}

async function youtubeMain() {
  console.log("=== YouTube Monitor Test Run ===\n");

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY niet gevonden in .env");
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Laatste 7 dagen
  const since = new Date();
  since.setDate(since.getDate() - 7);
  console.log(`Checken op video's na: ${since.toISOString()}\n`);

  const categories = channelsConfig.categories as YTCategoryConfig[];
  const videosByCategory = new Map<string, YTVideoWithSummary[]>();
  let totalNew = 0;

  for (const category of categories) {
    console.log(`━━━ ${category.emoji} ${category.name} ━━━`);
    const categoryVideos: YTVideoInfo[] = [];

    for (const channel of category.channels) {
      try {
        const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
        url.searchParams.set("part", "snippet,contentDetails");
        url.searchParams.set("playlistId", channel.uploadsPlaylistId);
        url.searchParams.set("maxResults", "10");
        url.searchParams.set("key", YOUTUBE_API_KEY);

        const res = await fetch(url.toString());
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json();
        let newCount = 0;
        for (const item of data.items || []) {
          const publishedAt = item.snippet.publishedAt;
          if (new Date(publishedAt) <= since) continue;
          categoryVideos.push({
            videoId: item.contentDetails.videoId,
            title: item.snippet.title,
            channelName: channel.name,
            channelId: channel.channelId,
            category: category.name,
            publishedAt,
            thumbnailUrl: item.snippet.thumbnails?.high?.url || "",
            videoUrl: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
          });
          newCount++;
        }
        console.log(`  ${channel.name}: ${newCount} nieuwe video's`);
        await delay(200);
      } catch (err) {
        console.error(`  ${channel.name} FOUT: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Transcripts + samenvattingen
    const withSummaries: YTVideoWithSummary[] = [];
    for (const video of categoryVideos) {
      console.log(`\n  Video: "${video.title}"`);
      console.log(`    URL: ${video.videoUrl}`);
      console.log(`    Gepubliceerd: ${new Date(video.publishedAt).toLocaleString("nl-NL")}`);

      let transcript: string | null = null;
      const transcriptAttempts = [
        () => YoutubeTranscript.fetchTranscript(video.videoId),
        () => YoutubeTranscript.fetchTranscript(video.videoId, { lang: "nl" }),
        () => YoutubeTranscript.fetchTranscript(video.videoId, { lang: "en" }),
      ];
      for (const attempt of transcriptAttempts) {
        try {
          const t = await attempt();
          if (t && t.length > 0) {
            transcript = t.map((s: any) => s.text).join(" ");
            if (transcript.length > 15000) transcript = transcript.substring(0, 15000) + "...";
            if (transcript.length > 0) break;
          }
        } catch { continue; }
      }

      const transcriptAvailable = transcript !== null;
      console.log(`    Transcript: ${transcriptAvailable ? `ja (${transcript!.length} chars)` : "niet beschikbaar"}`);

      let summary: string | null = null;
      if (transcript && ANTHROPIC_API_KEY) {
        try {
          const msg = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [
              {
                role: "user",
                content: ["Crypto", "Tech & AI", "Gezondheid", "Podcasts", "Economie"].includes(video.category)
                  ? `Summarize the following YouTube video in 3-5 concise bullet points in English. Focus on the key insights and takeaways. Use the format "• point".\n\nVideo: "${video.title}" by ${video.channelName}\n\nTranscript:\n${transcript}`
                  : `Vat de volgende YouTube-video samen in 3-5 beknopte bullet points in het Nederlands. Focus op de belangrijkste inzichten en takeaways. Gebruik het formaat "• punt".\n\nVideo: "${video.title}" van ${video.channelName}\n\nTranscript:\n${transcript}`,
              },
            ],
          });
          const textBlock = msg.content.find((b) => b.type === "text");
          summary = textBlock ? (textBlock as { type: "text"; text: string }).text : null;
          console.log(`    Samenvatting:\n${summary?.split("\n").map((l) => `      ${l}`).join("\n")}`);
          await delay(500);
        } catch (err) {
          console.error(`    Samenvatting FOUT: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      withSummaries.push({ ...video, summary, transcriptAvailable });
    }

    videosByCategory.set(category.name, withSummaries);
    totalNew += withSummaries.length;
    console.log();
  }

  console.log(`\n=== Totaal: ${totalNew} nieuwe video('s) ===\n`);

  // View counts ophalen
  const allVideos = Array.from(videosByCategory.values()).flat();
  if (allVideos.length > 0) {
    console.log("\n--- View counts ophalen ---");
    const videoIds = allVideos.map((v) => v.videoId);
    const viewCounts = new Map<string, number>();
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const vcUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      vcUrl.searchParams.set("part", "statistics");
      vcUrl.searchParams.set("id", batch.join(","));
      vcUrl.searchParams.set("key", YOUTUBE_API_KEY);
      const vcRes = await fetch(vcUrl.toString());
      if (vcRes.ok) {
        const vcData = await vcRes.json();
        for (const item of vcData.items || []) {
          viewCounts.set(item.id, parseInt(item.statistics.viewCount || "0", 10));
        }
      }
    }
    for (const v of allVideos) {
      const vc = viewCounts.get(v.videoId) || 0;
      console.log(`  ${v.title.slice(0, 50)}... → ${vc.toLocaleString()} views`);
    }

    // Supabase opslag
    if (supabase) {
      console.log("\n--- Opslaan in Supabase ---");
      const rows = allVideos.map((v) => ({
        channel_name: v.channelName,
        channel_id: v.channelId,
        category: v.category,
        video_id: v.videoId,
        video_title: v.title,
        video_url: v.videoUrl,
        published_at: v.publishedAt,
        thumbnail_url: v.thumbnailUrl,
        transcript_available: v.transcriptAvailable,
        summary: v.summary,
        view_count: viewCounts.get(v.videoId) || 0,
        checked_at: new Date().toISOString(),
      }));

      const { error: sbErr } = await supabase
        .from("youtube_videos")
        .upsert(rows, { onConflict: "video_id" });
      if (sbErr) console.error("Supabase FOUT:", sbErr);
      else console.log(`${rows.length} video's opgeslagen in Supabase`);
    }
  } else {
    console.log("\nGeen video's om op te slaan");
  }

  // Briefings + yearly overviews genereren voor Crypto en Tech & AI
  const briefingConfigs = [
    {
      category: "Crypto",
      briefingTable: "crypto_briefings",
      yearlyTable: "crypto_yearly_overview",
      weeklyPromptFn: (vs: string) => `You are a crypto market analyst. Below are summaries of recent crypto podcasts from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple podcasts or that are particularly relevant.

Focus on FUNDAMENTAL developments: regulation, technology, institutional adoption, infrastructure, and industry events. Do NOT focus on price action, trading patterns, or short-term market movements.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which podcasts discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the podcasters say accurate? Are they missing something? Are there counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "market mood" paragraph of 2-3 sentences summarizing the general tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching market mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- PODCAST SUMMARIES ---

${vs}`,
      yearlyPromptFn: (bs: string) => `You are a senior crypto analyst writing a comprehensive 12-month overview of the most important FUNDAMENTAL developments in cryptocurrency and blockchain.

You have two sources of information:
1. Weekly briefings from crypto podcasts (provided below) — use these as primary source where available
2. Your own knowledge of crypto events from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on fundamentals. Include:
- Regulation: ETF approvals, legal frameworks, government stances, enforcement actions
- Technology: Layer 2 scaling, protocol upgrades, new consensus mechanisms
- Institutional adoption: Corporate treasuries, bank integrations, payment processors
- Infrastructure: Stablecoin growth, DeFi milestones, cross-chain bridges
- Industry events: Exchange collapses, major hacks, mergers & acquisitions

Do NOT include: price predictions, trading patterns, short-term market movements, or speculation.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (industry-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences).

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary...",
  "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
    },
    {
      category: "Tech & AI",
      briefingTable: "ai_briefings",
      yearlyTable: "ai_yearly_overview",
      weeklyPromptFn: (vs: string) => `You are a tech and AI industry analyst. Below are summaries of recent tech/AI YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on FUNDAMENTAL developments: new model releases, framework updates, developer tooling breakthroughs, AI agent developments, startup launches, open-source milestones, and industry shifts. Do NOT focus on hype, speculation, or superficial product demos.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say accurate? Are they missing something? Are there counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "industry mood" paragraph of 2-3 sentences summarizing the general tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching industry mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${vs}`,
      yearlyPromptFn: (bs: string) => `You are a senior technology analyst writing a comprehensive 12-month overview of the most important FUNDAMENTAL developments in AI, developer tools, and the tech industry.

You have two sources of information:
1. Weekly briefings from tech/AI channels (provided below) — use these as primary source where available
2. Your own knowledge of tech/AI events from the past 12 months — use this to fill gaps and add context

Focus EXCLUSIVELY on fundamentals. Include:
- Model releases: Major LLM launches, capability breakthroughs
- Developer tools: New frameworks, IDEs, coding assistants, deployment platforms
- AI agents: Autonomous agent frameworks, multi-agent systems, tool use advances
- Open source: Major releases, community milestones, licensing changes
- Industry shifts: Acquisitions, funding rounds, company pivots, regulatory developments
- Infrastructure: GPU availability, cloud AI services, edge AI, training innovations

Do NOT include: hype cycles, speculation about AGI timelines, or superficial comparisons.

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (industry-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

Also write an overarching summary paragraph (3-4 sentences).

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching summary...",
  "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
    },
    {
      category: "Gezondheid",
      briefingTable: "gezondheid_briefings",
      yearlyTable: "gezondheid_yearly_overview",
      weeklyPromptFn: (vs: string) => `You are a health science and longevity analyst. Below are summaries of recent health-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on EVIDENCE-BASED developments: neuroscience protocols, longevity research, supplement science, sleep optimization, exercise physiology, biomarker tracking, and biohacking innovations. Do NOT focus on anecdotal claims, unverified hacks, or product promotions without scientific backing.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say backed by peer-reviewed research? Are they oversimplifying? Are there risks or counterarguments?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "health science mood" paragraph of 2-3 sentences summarizing the general tone and themes.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching health science mood paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${vs}`,
      yearlyPromptFn: (bs: string) => `You are a senior health science analyst writing a comprehensive 12-month overview of the most important developments in health optimization, longevity research, and biohacking.

You have two sources of information:
1. Weekly briefings from health-focused YouTube channels (provided below)
2. Your own knowledge of health science developments from the past 12 months

Focus EXCLUSIVELY on evidence-based developments. Include:
- Neuroscience: Sleep protocols, dopamine management, stress optimization, cognitive enhancement
- Longevity: Aging biomarkers, caloric restriction research, senolytic therapies, NAD+ pathways
- Exercise physiology: Training protocols, recovery science, cardiovascular health findings
- Nutrition: Supplement research updates, gut microbiome discoveries, metabolic health
- Biohacking: Wearable tech advances, blood testing innovations, light therapy, cold/heat exposure research
- Clinical research: Major study results, meta-analyses, guideline changes

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (field-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{
  "overview": "Overarching summary...",
  "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
    },
    {
      category: "Podcasts",
      briefingTable: "podcasts_briefings",
      yearlyTable: "podcasts_yearly_overview",
      weeklyPromptFn: (vs: string) => `You are a cultural commentary and interview analyst. Below are summaries of recent podcast episodes from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics, guest insights, or cultural themes discussed across episodes or that are particularly thought-provoking.

Focus on SUBSTANTIVE content: notable guest revelations, contrarian viewpoints, cultural shifts, entrepreneurship insights, psychological frameworks, and societal observations. Do NOT focus on entertainment gossip, clickbait moments, or superficial celebrity content.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining the key insight or discussion
3. Indicate which episodes discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is the guest's perspective well-founded? Are there important counterpoints or nuances they missed?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "podcast landscape" paragraph of 2-3 sentences summarizing the general themes and tone.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching podcast landscape paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${vs}`,
      yearlyPromptFn: (bs: string) => `You are a senior media analyst writing a comprehensive 12-month overview of the most important themes, guest insights, and cultural discussions from long-form podcast interviews.

You have two sources of information:
1. Weekly briefings from podcast channels (provided below)
2. Your own knowledge of major cultural and intellectual discussions from the past 12 months

Focus EXCLUSIVELY on substantive content. Include:
- Guest insights: Breakthrough ideas, personal revelations, expert perspectives
- Cultural commentary: Free speech debates, identity politics, media criticism, societal trends
- Entrepreneurship: Business lessons, startup wisdom, career frameworks
- Psychology & self-improvement: Mental health, behavioral science, habit formation
- Contrarian viewpoints: Important challenges to mainstream narratives

Identify the 5-10 most significant themes. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining the theme and why it matters
3. Rate significance: "high" (discourse-shaping) or "medium" (notable discussion)
4. Add your analysis: what are the long-term cultural implications?

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{
  "overview": "Overarching summary...",
  "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
    },
    {
      category: "Nieuws",
      briefingTable: "nieuws_briefings",
      yearlyTable: "nieuws_yearly_overview",
      weeklyPromptFn: (vs: string) => `Je bent een Nederlandse nieuwsanalist. Hieronder staan samenvattingen van recente nieuwsvideo's van de afgelopen week.

Analyseer alle samenvattingen en maak een gestructureerde briefing. Identificeer de 3-7 belangrijkste onderwerpen die besproken zijn.

Focus op FUNDAMENTELE ontwikkelingen: geopolitiek, Nederlandse politiek, economisch beleid, mediakritiek, maatschappelijke verschuivingen en wereldgebeurtenissen. Focus NIET op sensatie, complottheorieen zonder onderbouwing, of oppervlakkige meningen.

Per onderwerp:
1. Geef een korte, pakkende titel (max 10 woorden)
2. Schrijf een duidelijke paragraaf (3-5 zinnen) over wat er speelt
3. Geef aan welke video's dit onderwerp bespraken (gebruik de exacte video_id's uit de data)
4. Voeg context toe vanuit je eigen kennis: klopt wat er gezegd wordt? Missen ze iets? Zijn er tegenargumenten?
5. Geef een sentiment-indicator: "bullish", "bearish", of "neutral"

Schrijf ook een overkoepelende "nieuwsstemming" paragraaf van 2-3 zinnen over de algemene toon.

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences) in exact dit formaat:
{
  "overview": "Overkoepelende nieuwsstemming paragraaf hier...",
  "topics": [
    {
      "topic": "Korte pakkende titel",
      "summary": "Duidelijke paragraaf over wat er speelt...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "Wat je eigen kennis toevoegt: verificatie, nuance, ontbrekende context..."
    }
  ]
}

--- VIDEO SAMENVATTINGEN ---

${vs}`,
      yearlyPromptFn: (bs: string) => `Je bent een senior nieuwsanalist die een uitgebreid 12-maanden overzicht schrijft van de belangrijkste ontwikkelingen in het Nederlandse en wereldnieuws.

Je hebt twee informatiebronnen:
1. Wekelijkse briefings van nieuwskanalen (hieronder)
2. Je eigen kennis van nieuwsgebeurtenissen van de afgelopen 12 maanden

Focus UITSLUITEND op fundamentele ontwikkelingen:
- Geopolitiek: Internationale conflicten, diplomatieke verschuivingen, handelsoorlogen
- Nederlandse politiek: Kabinetsbeleid, verkiezingen, coalitiedynamiek
- Economisch beleid: Inflatie, ECB-beleid, woningmarkt, energietransitie
- Mediakritiek: Mainstream vs alternatieve media, censuurdebatten
- Maatschappij: Migratiedebatten, culturele verschuivingen, protestbewegingen

Identificeer de 5-10 meest significante ontwikkelingen. Per onderwerp:
1. Geef een duidelijke, beschrijvende titel (max 10 woorden)
2. Schrijf een grondige paragraaf (4-6 zinnen)
3. Beoordeel significantie: "high" of "medium"
4. Voeg je analyse toe: wat zijn de langetermijngevolgen?

BELANGRIJK: Antwoord ALLEEN met geldige JSON (geen markdown code fences):
{
  "overview": "Overkoepelende samenvatting...",
  "topics": [{ "topic": "Titel", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEKELIJKSE BRIEFINGS ---

${bs || "Nog geen wekelijkse briefings beschikbaar. Gebruik je eigen kennis."}`,
    },
    {
      category: "Economie",
      briefingTable: "economie_briefings",
      yearlyTable: "economie_yearly_overview",
      weeklyPromptFn: (vs: string) => `You are a macroeconomics analyst. Below are summaries of recent economics-focused YouTube channels from the past week.

Analyze all summaries and create a structured briefing. Identify the 3-7 most important topics discussed across multiple channels or that are particularly relevant.

Focus on FUNDAMENTAL developments: macroeconomic trends, central bank policy, housing markets, wealth inequality, labor markets, fiscal policy, and structural economic shifts. Do NOT focus on stock tips, day-trading strategies, or short-term market noise.

For each topic:
1. Give a short, catchy title (max 10 words)
2. Write a clear paragraph (3-5 sentences) explaining what's going on
3. Indicate which channels discussed this topic (use the exact video_id's from the data)
4. Add context from your own knowledge: is what the creators say backed by economic data? Are they oversimplifying complex dynamics? Are there counterarguments from other schools of economic thought?
5. Give a sentiment indicator: "bullish", "bearish", or "neutral"

Also write an overarching "economic outlook" paragraph of 2-3 sentences summarizing the general tone and themes.

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences) in exactly this format:
{
  "overview": "Overarching economic outlook paragraph here...",
  "topics": [
    {
      "topic": "Short catchy title",
      "summary": "Clear paragraph about what's going on...",
      "sentiment": "bullish",
      "source_video_ids": ["video_id_1", "video_id_2"],
      "news_context": "What your own knowledge adds: verification, nuance, missing context..."
    }
  ]
}

--- VIDEO SUMMARIES ---

${vs}`,
      yearlyPromptFn: (bs: string) => `You are a senior macroeconomics analyst writing a comprehensive 12-month overview of the most important economic developments, policy shifts, and structural trends.

You have two sources of information:
1. Weekly briefings from economics YouTube channels (provided below)
2. Your own knowledge of economic events from the past 12 months

Focus EXCLUSIVELY on fundamentals:
- Central bank policy: Interest rate decisions, quantitative tightening/easing
- Housing markets: Affordability crises, mortgage rate impacts, construction trends
- Wealth inequality: Wealth concentration data, wage stagnation, cost-of-living
- Labor markets: Employment trends, remote work shifts, automation impacts
- Fiscal policy: Government spending, taxation changes, debt levels
- Structural shifts: De-globalization, energy transition economics, demographics

Identify the 5-10 most significant developments. For each:
1. Give a clear, descriptive title (max 10 words)
2. Write a thorough paragraph (4-6 sentences) explaining what happened and why it matters
3. Rate significance: "high" (economy-changing) or "medium" (notable development)
4. Add your analysis: what are the long-term implications?

IMPORTANT: Respond ONLY with valid JSON (no markdown code fences):
{
  "overview": "Overarching summary...",
  "topics": [{ "topic": "Title", "summary": "...", "significance": "high", "analysis": "..." }]
}

--- WEEKLY BRIEFINGS ---

${bs || "No weekly briefings available yet. Use your own knowledge."}`,
    },
  ];

  if (supabase && process.env.ANTHROPIC_API_KEY) {
    for (const config of briefingConfigs) {
      // Weekly briefing
      console.log(`\n--- ${config.category} Briefing genereren ---`);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: catVideos } = await supabase
        .from("youtube_videos")
        .select("video_id, video_title, video_url, channel_name, summary, published_at")
        .eq("category", config.category)
        .eq("transcript_available", true)
        .not("summary", "is", null)
        .gte("published_at", weekAgo.toISOString())
        .order("published_at", { ascending: false });

      if (catVideos && catVideos.length > 0) {
        console.log(`${catVideos.length} summaries found`);

        const videoSummaries = catVideos
          .map((v: any) => `[${v.channel_name}] "${v.video_title}" (video_id: ${v.video_id})\n${v.summary}`)
          .join("\n\n---\n\n");

        try {
          const briefingResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2048,
            messages: [{ role: "user", content: config.weeklyPromptFn(videoSummaries) }],
          });

          const textBlock = briefingResponse.content.find((b) => b.type === "text");
          if (textBlock && textBlock.type === "text") {
            let jsonText = textBlock.text.trim();
            if (jsonText.startsWith("```")) {
              jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
            }
            const briefing = JSON.parse(jsonText);

            const videoMap = new Map(catVideos.map((v: any) => [v.video_id, v]));
            for (const topic of briefing.topics) {
              topic.sources = (topic.source_video_ids || [])
                .map((id: string) => videoMap.get(id))
                .filter(Boolean)
                .map((v: any) => ({
                  video_id: v.video_id,
                  video_title: v.video_title,
                  channel_name: v.channel_name,
                  video_url: v.video_url,
                }));
              delete topic.source_video_ids;
            }

            console.log(`\nOverview: ${briefing.overview}\n`);
            for (const topic of briefing.topics) {
              const icon = topic.sentiment === "bullish" ? "🟢" : topic.sentiment === "bearish" ? "🔴" : "🟡";
              console.log(`${icon} ${topic.topic}`);
            }

            const today = new Date().toISOString().slice(0, 10);
            const { error: sbErr } = await supabase.from(config.briefingTable).upsert(
              {
                briefing_date: today,
                overview: briefing.overview,
                topics: briefing.topics,
                videos_used: catVideos.length,
                channels_used: [...new Set(catVideos.map((v: any) => v.channel_name))],
              },
              { onConflict: "briefing_date" }
            );
            if (sbErr) console.error(`${config.category} briefing save error:`, sbErr);
            else console.log(`${config.category} briefing saved`);
          }
        } catch (err) {
          console.error(`${config.category} briefing error:`, err instanceof Error ? err.message : String(err));
        }
      } else {
        console.log(`No ${config.category} summaries available`);
      }

      // Yearly overview
      console.log(`\n--- ${config.category} Yearly Overview genereren ---`);

      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);

      const { data: briefings } = await supabase
        .from(config.briefingTable)
        .select("briefing_date, overview, topics")
        .gte("briefing_date", yearAgo.toISOString().slice(0, 10))
        .order("briefing_date", { ascending: false });

      const briefingSummaries = (briefings || [])
        .map((b: any) => {
          const topicSummary = (b.topics || [])
            .map((t: any) => `- ${t.topic}: ${t.summary}`)
            .join("\n");
          return `[${b.briefing_date}]\n${b.overview}\n${topicSummary}`;
        })
        .join("\n\n---\n\n");

      console.log(`${(briefings || []).length} briefings as context`);

      try {
        const yearlyResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: config.yearlyPromptFn(briefingSummaries) }],
        });

        const textBlock = yearlyResponse.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          let jsonText = textBlock.text.trim();
          if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          const overview = JSON.parse(jsonText);

          console.log(`\nOverview: ${overview.overview}\n`);
          for (const topic of overview.topics) {
            const badge = topic.significance === "high" ? "🔴" : "🟡";
            console.log(`${badge} ${topic.topic}`);
          }

          const { error: sbErr } = await supabase.from(config.yearlyTable).insert({
            overview: overview.overview,
            topics: overview.topics,
            briefings_used: (briefings || []).length,
          });
          if (sbErr) console.error(`${config.category} yearly save error:`, sbErr);
          else console.log(`${config.category} yearly overview saved`);
        }
      } catch (err) {
        console.error(`${config.category} yearly error:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  console.log(`\nKlaar! ${totalNew} video('s) verwerkt (e-mail uitgeschakeld).`);
}

// --- CLI routing ---

const args = process.argv.slice(2);
if (args.includes("--youtube") || args.includes("--yt")) {
  youtubeMain();
} else {
  main();
}
