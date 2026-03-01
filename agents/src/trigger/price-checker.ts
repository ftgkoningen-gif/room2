import { schedules } from "@trigger.dev/sdk";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import products from "./products.json";

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

function calcEffectivePrice(price: number, discountLabel: string | null): number {
  if (!discountLabel) return price;
  const label = discountLabel.toLowerCase();

  if (label.includes("1+1") || label.includes("2e gratis")) return price / 2;
  if (label.includes("2e halve prijs") || label.includes("2e 50%")) return (price + price / 2) / 2;
  if (label.includes("3+2 gratis") || label.includes("3 + 2 gratis")) return (price * 3) / 5;
  if (label.includes("2+1 gratis") || label.includes("2 + 1 gratis")) return (price * 2) / 3;

  const pctMatch = label.match(/(\d+)%\s*korting/);
  if (pctMatch) return price * (1 - parseInt(pctMatch[1]) / 100);

  return price;
}

// --- Datumlogica ---

function getOfferDateRange(): { from: string; to: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(tomorrow);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return {
    from: tomorrow.toISOString().slice(0, 10),
    to: weekEnd.toISOString().slice(0, 10),
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "appie" }),
  });
  if (!res.ok) throw new Error(`AH token failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function searchAh(query: string, token: string): Promise<Offer[]> {
  const url = `https://api.ah.nl/mobile-services/product/search/v2?query=${encodeURIComponent(query)}&sortOn=RELEVANCE&size=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "x-application": "AHWEBSHOP" },
  });
  if (!res.ok) throw new Error(`AH search failed: ${res.status}`);

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

    return {
      productName: p.title,
      supermarket: "Albert Heijn",
      currentPrice: price,
      originalPrice: isOnSale ? price : null,
      effectivePrice: isOnSale ? calcEffectivePrice(price, discountLabel) : price,
      discountLabel,
      discountPeriod,
      isOnSale,
      productUrl,
    };
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
        fetchSearchProducts: true,
        fetchProducts: false,
        skus: [""],
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
      query: `{ searchProducts(search: "${safeQuery}", limit: 10) { products { product { productId brand headerText packaging } } } }`,
    }),
  });
  if (!searchRes.ok) throw new Error(`Dirk search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const found = searchData?.data?.searchProducts?.products || [];
  if (found.length === 0) return [];

  const ids = found.map((p: any) => p.product.productId);

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

  return (priceData?.data?.products || []).map((p: any) => {
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
      productUrl: `https://www.dirk.nl/boodschappen?q=${encodeURIComponent(query)}`,
    };
  });
}

// --- Combine sources ---

async function checkProduct(
  product: (typeof products)[0],
  ahToken: string
): Promise<ProductResult> {
  const errors: string[] = [];
  let allOffers: Offer[] = [];

  // Albert Heijn
  try {
    const offers = await searchAh(product.ah.query, ahToken);
    allOffers.push(...filterOffers(offers, product.brand, product.titleContains));
  } catch (err) {
    errors.push(`AH: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Jumbo (met delay voor rate limiting)
  if (product.jumbo) {
    await delay(1500);
    try {
      const offers = await searchJumbo(product.jumbo.query);
      allOffers.push(...filterOffers(offers, product.brand, product.titleContains));
    } catch (err) {
      errors.push(`Jumbo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Dirk
  if (product.dirk) {
    try {
      const offers = await searchDirk(product.dirk.query);
      allOffers.push(...filterOffers(offers, product.brand, product.titleContains));
    } catch (err) {
      errors.push(`Dirk: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { name: product.name, offers: allOffers, errors };
}

// --- Email ---

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function buildEmailHtml(results: ProductResult[]): string {
  const { from, to } = getOfferDateRange();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const week = getWeekNumber(tomorrow);

  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #FF7300; font-size: 24px; border-bottom: 2px solid #FF7300; padding-bottom: 10px;">
        Price Hunter — Week ${week}
      </h1>
      <p style="color: #666; font-size: 14px;">Aanbiedingen ${formatDate(from)} t/m ${formatDate(to)}</p>
  `;

  for (const result of results) {
    html += `<div style="margin: 20px 0; padding: 16px; background: #f8f9fa; border-radius: 8px;">`;
    html += `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #333;">${result.name}</h2>`;

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        html += `<p style="color: #dc3545; font-size: 12px;">Fout: ${err}</p>`;
      }
    }

    const best = bestPerSupermarket(result.offers);

    if (best.length === 0 && result.errors.length === 0) {
      html += `<p style="color: #666;">Geen resultaten gevonden.</p>`;
    } else if (best.length > 0) {
      const cheapest = best.reduce((a, b) => a.effectivePrice < b.effectivePrice ? a : b);
      const cheapestLink = cheapest.productUrl
        ? `<a href="${cheapest.productUrl}" style="font-size: 16px; font-weight: bold; color: #2e7d32; text-decoration: underline;" target="_blank">${cheapest.supermarket}</a>`
        : `<span style="font-size: 16px; font-weight: bold;">${cheapest.supermarket}</span>`;

      html += `
        <div style="padding: 12px; margin: 8px 0; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
          <strong style="color: #2e7d32; font-size: 14px;">GOEDKOOPST</strong><br/>
          ${cheapestLink} —
          <strong style="font-size: 18px; color: #2e7d32;">&euro;${cheapest.effectivePrice.toFixed(2)}</strong>
          <span style="font-size: 12px; color: #666;"> per stuk${cheapest.isOnSale ? " (met actie)" : ""}</span>
          ${cheapest.discountLabel ? `<br/><span style="font-size: 13px; color: #FF7300;">${cheapest.discountLabel}</span>` : ""}
          ${cheapest.discountPeriod ? `<br/><span style="font-size: 12px; color: #555;">Looptijd: ${cheapest.discountPeriod}</span>` : ""}
        </div>`;

      // Prijsvergelijking andere supermarkten
      const others = best.filter((o) => o !== cheapest).sort((a, b) => a.effectivePrice - b.effectivePrice);
      if (others.length > 0) {
        html += `<table style="width: 100%; font-size: 13px; margin-top: 8px; border-collapse: collapse;">`;
        for (const o of others) {
          const link = o.productUrl
            ? `<a href="${o.productUrl}" style="color: #333; text-decoration: underline;" target="_blank">${o.supermarket}</a>`
            : o.supermarket;
          html += `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 6px 0;">${link}</td>
              <td style="padding: 6px 0; text-align: right;">
                <strong>&euro;${o.effectivePrice.toFixed(2)}</strong>
                ${o.discountLabel ? `<span style="color: #FF7300; font-size: 11px; margin-left: 4px;">${o.discountLabel}</span>` : ""}
              </td>
            </tr>`;
        }
        html += `</table>`;
      }
    }

    html += `</div>`;
  }

  html += `
      <p style="font-size: 11px; color: #aaa; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
        Bronnen: Albert Heijn API, Jumbo API, Dirk API<br/>
        Bij 1+1 / 2e gratis: effectieve prijs = gemiddelde stuksprijs<br/>
        Automatisch verstuurd door Price Hunter via Trigger.dev
      </p>
    </div>`;

  return html;
}

// --- Supabase opslag ---

async function saveToSupabase(results: ProductResult[], weekNumber: number, year: number) {
  if (!supabase) {
    console.log("Supabase niet geconfigureerd, opslag overgeslagen");
    return;
  }

  const rows = [];
  for (const result of results) {
    const best = bestPerSupermarket(result.offers);
    for (const offer of best) {
      rows.push({
        week_number: weekNumber,
        year,
        product_name: result.name,
        supermarket: offer.supermarket,
        current_price: offer.currentPrice,
        original_price: offer.originalPrice,
        effective_price: offer.effectivePrice,
        discount_label: offer.discountLabel,
        discount_period: offer.discountPeriod,
        is_on_sale: offer.isOnSale,
        product_url: offer.productUrl,
      });
    }
  }

  const { error } = await supabase
    .from("price_checks")
    .upsert(rows, { onConflict: "year,week_number,product_name,supermarket" });

  if (error) {
    console.error("Supabase upsert mislukt:", error);
  } else {
    console.log(`${rows.length} prijzen opgeslagen in Supabase`);
  }
}

// --- Scheduled task ---

export const priceChecker = schedules.task({
  id: "price-checker",
  cron: {
    pattern: "30 20 * * 0", // Zondag 20:30
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 120,
  run: async () => {
    const { from, to } = getOfferDateRange();
    console.log(`Price check gestart voor ${products.length} producten`);
    console.log(`Aanbiedingen periode: ${from} t/m ${to}`);

    let ahToken = "";
    try {
      ahToken = await getAhToken();
      console.log("AH API token verkregen");
    } catch (err) {
      console.error("AH token mislukt:", err);
    }

    const results: ProductResult[] = [];
    for (const product of products) {
      console.log(`Checking: ${product.name}`);
      const result = await checkProduct(product, ahToken);
      results.push(result);

      const best = bestPerSupermarket(result.offers);
      console.log(`  → ${result.offers.length} resultaten van ${best.length} supermarkten`);
      if (best.length > 0) {
        const cheapest = best.reduce((a, b) => a.effectivePrice < b.effectivePrice ? a : b);
        console.log(`  → Goedkoopst: ${cheapest.supermarket} €${cheapest.effectivePrice.toFixed(2)}/stuk`);
      }
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const week = getWeekNumber(tomorrow);
    const year = tomorrow.getFullYear();

    // Opslaan in Supabase
    await saveToSupabase(results, week, year);

    const emailHtml = buildEmailHtml(results);
    const emailTo = process.env.EMAIL_TO || "koningen@proton.me";
    const emailFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";

    const { data, error } = await resend.emails.send({
      from: `Price Hunter <${emailFrom}>`,
      to: [emailTo],
      subject: `Price Hunter — Aanbiedingen week ${week}`,
      html: emailHtml,
    });

    if (error) {
      console.error("E-mail versturen mislukt:", error);
      throw new Error(`Email failed: ${error.message}`);
    }

    console.log(`E-mail verstuurd naar ${emailTo}, id: ${data?.id}`);

    return {
      productsChecked: products.length,
      totalOffers: results.reduce((sum, r) => sum + r.offers.filter((o) => o.isOnSale).length, 0),
      emailId: data?.id,
    };
  },
});
