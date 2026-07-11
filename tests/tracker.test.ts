import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "../src/db.js";
import { Repository } from "../src/repository.js";
import { Tracker } from "../src/tracker.js";

let db: Database.Database;
let repo: Repository;

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = new Repository(db);
});

afterEach(() => {
  db.close();
});

describe("Repository", () => {
  it("adds and lists products", () => {
    repo.addProduct({ name: "Widget", url: "https://x.test/widget" });
    repo.addProduct({ name: "Gadget", url: "https://x.test/gadget" });
    const products = repo.listProducts();
    expect(products.map((p) => p.name)).toEqual(["Widget", "Gadget"]);
  });

  it("records and returns price history newest-first", () => {
    const p = repo.addProduct({ name: "Widget", url: "https://x.test/widget" });
    repo.recordPrice(p.id, 10, "USD");
    repo.recordPrice(p.id, 9, "USD");
    const history = repo.getHistory(p.id);
    expect(history.map((h) => h.price)).toEqual([9, 10]);
    expect(repo.getLatestPrice(p.id)?.price).toBe(9);
  });

  it("cascades history deletion when a product is removed", () => {
    const p = repo.addProduct({ name: "Widget", url: "https://x.test/widget" });
    repo.recordPrice(p.id, 5, "USD");
    expect(repo.removeProduct(p.id)).toBe(true);
    expect(repo.getHistory(p.id)).toHaveLength(0);
  });
});

describe("Tracker", () => {
  it("rejects duplicate URLs", () => {
    const tracker = new Tracker(repo);
    tracker.track({ name: "Widget", url: "https://x.test/widget" });
    expect(() =>
      tracker.track({ name: "Dup", url: "https://x.test/widget" }),
    ).toThrow(/Already tracking/);
  });

  it("refreshes a product by fetching and recording its price", async () => {
    const fakeFetch = (async () =>
      new Response(`<meta property="og:price:amount" content="42.00">`, {
        status: 200,
      })) as unknown as typeof fetch;
    const tracker = new Tracker(repo, fakeFetch);
    const product = tracker.track({
      name: "Widget",
      url: "https://x.test/widget",
    });
    const point = await tracker.refreshOne(product.id);
    expect(point.price).toBe(42);
    expect(repo.getLatestPrice(product.id)?.price).toBe(42);
  });

  it("collects per-product errors during refreshAll", async () => {
    const fakeFetch = (async () =>
      new Response("no price here", { status: 200 })) as unknown as typeof fetch;
    const tracker = new Tracker(repo, fakeFetch);
    tracker.track({ name: "Widget", url: "https://x.test/widget" });
    const results = await tracker.refreshAll();
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toMatch(/Could not extract/);
  });
});
