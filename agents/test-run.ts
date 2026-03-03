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

// --- Filter & helpers ---

function filterOffers(offers: Offer[], brand: string, titleContains: string[]): Offer[] {
  return offers.filter((o) => {
    const title = o.productName.toLowerCase();
    if (!title.includes(brand.toLowerCase())) return false;
    for (const tc of titleContains) {
      const alternatives = tc.toLowerCase().split("|");
      if (!alternatives.some((alt) => title.includes(alt))) return false;
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
    return { productName: p.title, supermarket: "Albert Heijn", currentPrice: price, originalPrice: isOnSale ? price : null, effectivePrice: isOnSale ? calcEffectivePrice(price, discountLabel) : price, discountLabel, discountPeriod, isOnSale, productUrl };
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
    try {
      const ah = await searchAh(product.ah.query, ahToken);
      const filtered = filterOffers(ah, product.brand, product.titleContains);
      console.log(`  AH: ${ah.length} resultaten → ${filtered.length} na filter`);
      allOffers.push(...filtered);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.log(`  AH FOUT: ${m}`);
      errors.push(m);
    }

    // Jumbo
    if (product.jumbo) {
      await delay(1500);
      try {
        const jumbo = await searchJumbo(product.jumbo.query);
        const filtered = filterOffers(jumbo, product.brand, product.titleContains);
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
        const filtered = filterOffers(dirk, product.brand, product.titleContains);
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
        const filtered = filterOffers(aldi, product.brand, product.titleContains);
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
        const filtered = filterOffers(vomar, product.brand, product.titleContains);
        console.log(`  Vomar: ${vomar.length} resultaten → ${filtered.length} na filter`);
        allOffers.push(...filtered);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.log(`  Vomar FOUT: ${m}`);
        errors.push(m);
      }
    }

    // Resultaten per supermarkt
    const best = bestPerSupermarket(allOffers);
    if (best.length > 0) {
      console.log(`\n  Beste prijs per supermarkt:`);
      for (const o of best.sort((a, b) => a.effectivePrice - b.effectivePrice)) {
        console.log(`    ${o.supermarket} — €${o.effectivePrice.toFixed(2)}/stuk${o.isOnSale ? ` (${o.discountLabel})` : " (regulier)"}${o.discountPeriod ? ` | ${o.discountPeriod}` : ""}${o.productUrl ? `\n      → ${o.productUrl}` : ""}`);
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
      to: [emailTo], subject: `Price Hunter — Aanbiedingen week ${week} (TEST)`, html: emailHtml,
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
  const { from, to } = getOfferDateRange();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = getWeekNumber(tomorrow);

  let html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h1 style="color:#FF7300;font-size:24px;border-bottom:2px solid #FF7300;padding-bottom:10px;">Price Hunter — Week ${week}</h1>
    <p style="color:#666;font-size:14px;">Aanbiedingen ${formatDate(from)} t/m ${formatDate(to)}</p>`;

  for (const r of results) {
    html += `<div style="margin:20px 0;padding:16px;background:#f8f9fa;border-radius:8px;">`;
    html += `<h2 style="margin:0 0 12px;font-size:18px;color:#333;">${r.name}</h2>`;

    for (const e of r.errors) html += `<p style="color:#dc3545;font-size:12px;">Fout: ${e}</p>`;

    const best = bestPerSupermarket(r.offers);

    if (best.length === 0 && r.errors.length === 0) {
      html += `<p style="color:#666;">Geen resultaten gevonden.</p>`;
    } else if (best.length > 0) {
      const cheapest = best.reduce((a, b) => a.effectivePrice < b.effectivePrice ? a : b);
      const cheapestLink = cheapest.productUrl
        ? `<a href="${cheapest.productUrl}" style="font-size:16px;font-weight:bold;color:#2e7d32;text-decoration:underline;" target="_blank">${cheapest.supermarket}</a>`
        : `<span style="font-size:16px;font-weight:bold;">${cheapest.supermarket}</span>`;

      html += `<div style="padding:12px;margin:8px 0;background:#e8f5e9;border-left:4px solid #4caf50;border-radius:4px;">
        <strong style="color:#2e7d32;font-size:14px;">GOEDKOOPST</strong><br/>
        ${cheapestLink} —
        <strong style="font-size:18px;color:#2e7d32;">&euro;${cheapest.effectivePrice.toFixed(2)}</strong>
        <span style="font-size:12px;color:#666;"> per stuk${cheapest.isOnSale ? " (met actie)" : ""}</span>
        ${cheapest.discountLabel ? `<br/><span style="font-size:13px;color:#FF7300;">${cheapest.discountLabel}</span>` : ""}
        ${cheapest.discountPeriod ? `<br/><span style="font-size:12px;color:#555;">Looptijd: ${cheapest.discountPeriod}</span>` : ""}
      </div>`;

      // Prijsvergelijking andere supermarkten
      const others = best.filter((o) => o !== cheapest).sort((a, b) => a.effectivePrice - b.effectivePrice);
      if (others.length > 0) {
        html += `<table style="width:100%;font-size:13px;margin-top:8px;border-collapse:collapse;">`;
        for (const o of others) {
          const link = o.productUrl
            ? `<a href="${o.productUrl}" style="color:#333;text-decoration:underline;" target="_blank">${o.supermarket}</a>`
            : o.supermarket;
          html += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 0;">${link}</td>
            <td style="padding:6px 0;text-align:right;">
              <strong>&euro;${o.effectivePrice.toFixed(2)}</strong>
              ${o.discountLabel ? `<span style="color:#FF7300;font-size:11px;margin-left:4px;">${o.discountLabel}</span>` : ""}
            </td>
          </tr>`;
        }
        html += `</table>`;
      }
    }

    html += `</div>`;
  }

  html += `<p style="font-size:11px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:10px;">
    Bronnen: Albert Heijn API, Jumbo API, Dirk API, Aldi API, Vomar API<br/>
    Bij 1+1 / 2e gratis: effectieve prijs = gemiddelde stuksprijs<br/>
    Automatisch verstuurd door Price Hunter via Trigger.dev</p></div>`;
  return html;
}

// --- YouTube Monitor ---

import Anthropic from "@anthropic-ai/sdk";
import ytTranscript from "@danielxceron/youtube-transcript";
const { YoutubeTranscript } = ytTranscript;
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
                content: `Vat de volgende YouTube-video samen in 3-5 beknopte bullet points in het Nederlands. Focus op de belangrijkste inzichten en takeaways. Gebruik het formaat "• punt".\n\nVideo: "${video.title}" van ${video.channelName}\n\nTranscript:\n${transcript}`,
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

  console.log(`\nKlaar! ${totalNew} video('s) verwerkt (e-mail uitgeschakeld).`);
}

// --- CLI routing ---

const args = process.argv.slice(2);
if (args.includes("--youtube") || args.includes("--yt")) {
  youtubeMain();
} else {
  main();
}
