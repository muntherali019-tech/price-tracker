import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Open (and if necessary create) the SQLite database, applying the schema.
 *
 * Pass `:memory:` for an ephemeral database, which is used by the tests.
 */
export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      url          TEXT NOT NULL UNIQUE,
      selector     TEXT,
      currency     TEXT,
      target_price REAL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price       REAL NOT NULL,
      currency    TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_product
      ON price_history (product_id, recorded_at);
  `);

  // Additive column migrations for databases created before the column existed.
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so guard on the current schema.
  ensureColumn(db, "products", "target_price", "REAL");
}

interface ColumnRow {
  name: string;
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnRow[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
