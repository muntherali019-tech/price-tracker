import type { ExtractedPrice } from "./types.js";

/**
 * Extract a price from raw HTML using a few common conventions, in order:
 *   1. Open Graph / product meta tags (`og:price:amount`, `product:price:amount`)
 *   2. Schema.org `itemprop="price"`
 *   3. The first currency-looking number in the document
 *
 * This is a deliberately simple, dependency-free heuristic. Site-specific
 * extraction (via the product's `selector`) can be layered on later.
 *
 * Returns `null` when no price can be found.
 */
export function extractPrice(html: string): ExtractedPrice | null {
  const metaAmount =
    matchMetaContent(html, "og:price:amount") ??
    matchMetaContent(html, "product:price:amount");
  if (metaAmount) {
    const price = parseAmount(metaAmount);
    if (price !== null) {
      const currency =
        matchMetaContent(html, "og:price:currency") ??
        matchMetaContent(html, "product:price:currency");
      return { price, currency: currency?.toUpperCase() ?? null };
    }
  }

  const itemprop = html.match(
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
  );
  if (itemprop?.[1]) {
    const price = parseAmount(itemprop[1]);
    if (price !== null) {
      return { price, currency: detectCurrency(html) };
    }
  }

  const inline = html.match(/([$€£¥])\s?(\d[\d.,]*)/);
  if (inline?.[1] && inline[2]) {
    const price = parseAmount(inline[2]);
    if (price !== null) {
      return { price, currency: symbolToCurrency(inline[1]) };
    }
  }

  return null;
}

/** Fetch a URL and extract its current price. Requires network access. */
export async function fetchPrice(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractedPrice | null> {
  const res = await fetchImpl(url, {
    headers: { "user-agent": "price-tracker/0.1 (+https://github.com)" },
  });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return extractPrice(html);
}

function matchMetaContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const forward = html.match(re)?.[1];
  if (forward) return forward;
  // Handle attributes in the reverse order (content before property).
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`,
    "i",
  );
  return html.match(re2)?.[1];
}

/** Parse a human-formatted amount ("1,299.00", "1.299,00") into a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Comma is the decimal separator (e.g. "1.299,00").
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is the decimal separator (e.g. "1,299.00").
    s = s.replace(/,/g, "");
  }

  const value = Number.parseFloat(s);
  return Number.isFinite(value) ? value : null;
}

function detectCurrency(html: string): string | null {
  const meta = matchMetaContent(html, "priceCurrency");
  if (meta) return meta.toUpperCase();
  const itemprop = html.match(
    /itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i,
  );
  return itemprop?.[1]?.toUpperCase() ?? null;
}

function symbolToCurrency(symbol: string): string | null {
  const map: Record<string, string> = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
  };
  return map[symbol] ?? null;
}
