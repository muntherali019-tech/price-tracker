import type Database from "better-sqlite3";
import type { NewProduct, PricePoint, Product } from "./types.js";

interface ProductRow {
  id: number;
  name: string;
  url: string;
  selector: string | null;
  currency: string | null;
  created_at: string;
}

interface PriceRow {
  id: number;
  product_id: number;
  price: number;
  currency: string | null;
  recorded_at: string;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    selector: row.selector,
    currency: row.currency,
    createdAt: row.created_at,
  };
}

function toPricePoint(row: PriceRow): PricePoint {
  return {
    id: row.id,
    productId: row.product_id,
    price: row.price,
    currency: row.currency,
    recordedAt: row.recorded_at,
  };
}

/** Data access for tracked products and their price history. */
export class Repository {
  constructor(private readonly db: Database.Database) {}

  addProduct(input: NewProduct): Product {
    const stmt = this.db.prepare(
      `INSERT INTO products (name, url, selector, currency)
       VALUES (@name, @url, @selector, @currency)`,
    );
    const info = stmt.run({
      name: input.name,
      url: input.url,
      selector: input.selector ?? null,
      currency: input.currency ?? null,
    });
    const created = this.getProduct(Number(info.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to read back inserted product");
    }
    return created;
  }

  getProduct(id: number): Product | undefined {
    const row = this.db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(id) as ProductRow | undefined;
    return row ? toProduct(row) : undefined;
  }

  findProductByUrl(url: string): Product | undefined {
    const row = this.db
      .prepare(`SELECT * FROM products WHERE url = ?`)
      .get(url) as ProductRow | undefined;
    return row ? toProduct(row) : undefined;
  }

  listProducts(): Product[] {
    const rows = this.db
      .prepare(`SELECT * FROM products ORDER BY id`)
      .all() as ProductRow[];
    return rows.map(toProduct);
  }

  removeProduct(id: number): boolean {
    const info = this.db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  recordPrice(
    productId: number,
    price: number,
    currency: string | null,
  ): PricePoint {
    const stmt = this.db.prepare(
      `INSERT INTO price_history (product_id, price, currency)
       VALUES (?, ?, ?)`,
    );
    const info = stmt.run(productId, price, currency);
    const row = this.db
      .prepare(`SELECT * FROM price_history WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as PriceRow;
    return toPricePoint(row);
  }

  getHistory(productId: number, limit?: number): PricePoint[] {
    const sql =
      `SELECT * FROM price_history WHERE product_id = ? ORDER BY recorded_at DESC, id DESC` +
      (limit ? ` LIMIT ${Number(limit)}` : "");
    const rows = this.db.prepare(sql).all(productId) as PriceRow[];
    return rows.map(toPricePoint);
  }

  getLatestPrice(productId: number): PricePoint | undefined {
    const [latest] = this.getHistory(productId, 1);
    return latest;
  }
}
