/** A product whose price we track over time. */
export interface Product {
  id: number;
  name: string;
  url: string;
  /** Optional CSS-ish hint used by the fetcher; reserved for future use. */
  selector: string | null;
  currency: string | null;
  createdAt: string;
}

/** Input used to create a new tracked product. */
export interface NewProduct {
  name: string;
  url: string;
  selector?: string | null;
  currency?: string | null;
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
