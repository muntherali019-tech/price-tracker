/** A product whose price we track over time. */
export interface Product {
  id: number;
  name: string;
  url: string;
  /** Optional CSS-ish hint used by the fetcher; reserved for future use. */
  selector: string | null;
  currency: string | null;
  /** Target price for drop alerts; null means no alert set. */
  targetPrice: number | null;
  createdAt: string;
}

/** Input used to create a new tracked product. */
export interface NewProduct {
  name: string;
  url: string;
  selector?: string | null;
  currency?: string | null;
  targetPrice?: number | null;
}

/** A single observed price for a product at a point in time. */
export interface PricePoint {
  id: number;
  productId: number;
  price: number;
  currency: string | null;
  recordedAt: string;
}

/** Result of extracting a price from a page. */
export interface ExtractedPrice {
  price: number;
  currency: string | null;
}

/**
 * Pluggable AI price extractor. Given raw HTML (and light context), returns a
 * price or `null`. Kept as an injectable interface so a model can be wired in
 * without adding a hard dependency or network calls to the default build.
 */
export type AiExtractor = (
  html: string,
  context: { url?: string },
) => Promise<ExtractedPrice | null>;

/** Summary analytics for a product's price history. */
export interface PriceStats {
  count: number;
  current: number;
  min: number;
  max: number;
  average: number;
  first: number;
  /** Signed % change from the first recorded price to the current one. */
  changePct: number;
  /** How far below the all-time peak the current price sits, as a %. */
  savingsVsPeakPct: number;
  currency: string | null;
  /** True when the current price is within `nearLowThreshold` of the all-time low. */
  atOrNearLow: boolean;
}

/** A ranked deal across the whole watchlist. */
export interface Deal {
  product: Product;
  current: number;
  peak: number;
  discountPct: number;
  currency: string | null;
  hitsTarget: boolean;
}
