import type {
  AiExtractor,
  Deal,
  NewProduct,
  PricePoint,
  PriceStats,
  Product,
} from "./types.js";
import { Repository } from "./repository.js";
import { fetchPrice } from "./fetcher.js";
import { priceStats, rankDeals } from "./analytics.js";

export interface TrackerOptions {
  fetchImpl?: typeof fetch;
  /** Optional AI extractor fallback for price fetching. */
  ai?: AiExtractor;
}

/** A refreshed price plus whether it tripped the product's target alert. */
export interface RefreshResult {
  product: Product;
  point?: PricePoint;
  error?: string;
  /** True when the recorded price is at or below the product's target. */
  alert?: boolean;
}

/**
 * High-level operations for the price tracker, composing the repository and
 * the fetcher. The CLI is a thin wrapper over this class.
 */
export class Tracker {
  private readonly fetchImpl: typeof fetch;
  private readonly ai?: AiExtractor;

  constructor(
    private readonly repo: Repository,
    options: TrackerOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ai = options.ai;
  }

  track(input: NewProduct): Product {
    const existing = this.repo.findProductByUrl(input.url);
    if (existing) {
      throw new Error(`Already tracking a product with URL ${input.url}`);
    }
    return this.repo.addProduct(input);
  }

  list(): Product[] {
    return this.repo.listProducts();
  }

  get(id: number): Product | undefined {
    return this.repo.getProduct(id);
  }

  untrack(id: number): boolean {
    return this.repo.removeProduct(id);
  }

  history(id: number, limit?: number): PricePoint[] {
    return this.repo.getHistory(id, limit);
  }

  /** Set (or clear, with `null`) a target price for drop alerts. */
  setTarget(id: number, target: number | null): boolean {
    return this.repo.setTargetPrice(id, target);
  }

  /** Statistics for a product's full history, or `null` if it has none. */
  stats(id: number): PriceStats | null {
    return priceStats(this.repo.getHistoryAsc(id));
  }

  /** Rank every tracked product by discount versus its observed peak. */
  deals(): Deal[] {
    return rankDeals(
      this.repo
        .listProducts()
        .map((product) => ({ product, points: this.repo.getHistoryAsc(product.id) })),
    );
  }

  /** Products whose latest recorded price is at or below their target. */
  activeAlerts(): Array<{ product: Product; latest: PricePoint }> {
    const hits: Array<{ product: Product; latest: PricePoint }> = [];
    for (const product of this.repo.listProducts()) {
      if (product.targetPrice === null) continue;
      const latest = this.repo.getLatestPrice(product.id);
      if (latest && latest.price <= product.targetPrice) {
        hits.push({ product, latest });
      }
    }
    return hits;
  }

  /** Fetch and record the current price for a single tracked product. */
  async refreshOne(id: number): Promise<RefreshResult> {
    const product = this.repo.getProduct(id);
    if (!product) {
      throw new Error(`No product with id ${id}`);
    }
    const extracted = await fetchPrice(product.url, {
      fetchImpl: this.fetchImpl,
      ai: this.ai,
    });
    if (!extracted) {
      throw new Error(`Could not extract a price from ${product.url}`);
    }
    const point = this.repo.recordPrice(
      product.id,
      extracted.price,
      extracted.currency ?? product.currency,
    );
    const alert =
      product.targetPrice !== null && point.price <= product.targetPrice;
    return { product, point, alert };
  }

  /** Refresh every tracked product, collecting per-product outcomes. */
  async refreshAll(): Promise<RefreshResult[]> {
    const results: RefreshResult[] = [];
    for (const product of this.repo.listProducts()) {
      try {
        results.push(await this.refreshOne(product.id));
      } catch (err) {
        results.push({
          product,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}
