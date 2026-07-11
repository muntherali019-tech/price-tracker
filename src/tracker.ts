import type { NewProduct, PricePoint, Product } from "./types.js";
import { Repository } from "./repository.js";
import { fetchPrice } from "./fetcher.js";

/**
 * High-level operations for the price tracker, composing the repository and
 * the fetcher. The CLI is a thin wrapper over this class.
 */
export class Tracker {
  constructor(
    private readonly repo: Repository,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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

  untrack(id: number): boolean {
    return this.repo.removeProduct(id);
  }

  history(id: number, limit?: number): PricePoint[] {
    return this.repo.getHistory(id, limit);
  }

  /** Fetch and record the current price for a single tracked product. */
  async refreshOne(id: number): Promise<PricePoint> {
    const product = this.repo.getProduct(id);
    if (!product) {
      throw new Error(`No product with id ${id}`);
    }
    const extracted = await fetchPrice(product.url, this.fetchImpl);
    if (!extracted) {
      throw new Error(`Could not extract a price from ${product.url}`);
    }
    return this.repo.recordPrice(
      product.id,
      extracted.price,
      extracted.currency ?? product.currency,
    );
  }

  /** Refresh every tracked product, collecting per-product outcomes. */
  async refreshAll(): Promise<
    Array<{ product: Product; point?: PricePoint; error?: string }>
  > {
    const results: Array<{
      product: Product;
      point?: PricePoint;
      error?: string;
    }> = [];
    for (const product of this.repo.listProducts()) {
      try {
        const point = await this.refreshOne(product.id);
        results.push({ product, point });
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
