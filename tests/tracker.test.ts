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

function priceFetch(value: number): typeof fetch {
  return (async () =>
    new Response(`<meta property="og:price:amount" content="${value}">`, {
      status: 200,
    })) as unknown as typeof fetch;
}

describe("Repository", () => {
  it("adds and lists products", () => {
    repo.addProduct({ name: "Widget", url: "https://x.test/widget" });
    repo.addProduct({ name: "Gadget", url: "https://x.test/gadget" });
    expect(repo.listProducts().map((p) => p.name)).toEqual(["Widget", "Gadget"]);
  });

  it("records and returns price history newest-first", () => {
    const p = repo.addProduct({ name: "Widget", url: "https://x.test/widget" });
    repo.recordPrice(p.id, 10, "USD");
    repo.recordPrice(p.id, 9, "USD");
    expect(repo.getHistory(p.id).map((h) => h.price)).toEqual([9, 10]);
    expect(repo.getHistoryAsc(p.id).map((h) => h.price)).toEqual([10, 9]);
    expect(repo.getLatestPrice(p.id)?.price).toBe(9);
  });

  it("stores and clears a target price", () => {
    const p = repo.addProduct({
      name: "Widget",
      url: "https://x.test/widget",
      targetPrice: 8,
    });
    expect(repo.getProduct(p.id)?.targetPrice).toBe(8);
    repo.setTargetPrice(p.id, null);
    expect(repo.getProduct(p.id)?.targetPrice).toBeNull();
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
    const tracker = new Tracker(repo, { fetchImpl: priceFetch(42) });
    const product = tracker.track({ name: "Widget", url: "https://x.test/widget" });
    const result = await tracker.refreshOne(product.id);
    expect(result.point?.price).toBe(42);
    expect(repo.getLatestPrice(product.id)?.price).toBe(42);
  });

  it("flags an alert when a refreshed price meets the target", async () => {
    const tracker = new Tracker(repo, { fetchImpl: priceFetch(20) });
    const product = tracker.track({
      name: "Widget",
      url: "https://x.test/widget",
      targetPrice: 25,
    });
    const result = await tracker.refreshOne(product.id);
    expect(result.alert).toBe(true);
    expect(tracker.activeAlerts()).toHaveLength(1);
  });

  it("does not flag an alert when the price is above target", async () => {
    const tracker = new Tracker(repo, { fetchImpl: priceFetch(30) });
    const product = tracker.track({
      name: "Widget",
      url: "https://x.test/widget",
      targetPrice: 25,
    });
    const result = await tracker.refreshOne(product.id);
    expect(result.alert).toBe(false);
    expect(tracker.activeAlerts()).toHaveLength(0);
  });

  it("collects per-product errors during refreshAll", async () => {
    const fakeFetch = (async () =>
      new Response("no price here", { status: 200 })) as unknown as typeof fetch;
    const tracker = new Tracker(repo, { fetchImpl: fakeFetch });
    tracker.track({ name: "Widget", url: "https://x.test/widget" });
    const results = await tracker.refreshAll();
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toMatch(/Could not extract/);
  });

  it("computes stats and ranks deals across the watchlist", () => {
    const a = repo.addProduct({ name: "A", url: "https://x.test/a", currency: "USD" });
    const b = repo.addProduct({ name: "B", url: "https://x.test/b", currency: "USD" });
    repo.recordPrice(a.id, 100, "USD", "2026-01-01 00:00:00");
    repo.recordPrice(a.id, 60, "USD", "2026-01-02 00:00:00"); // 40% off peak
    repo.recordPrice(b.id, 50, "USD", "2026-01-01 00:00:00");
    repo.recordPrice(b.id, 45, "USD", "2026-01-02 00:00:00"); // 10% off peak
    const tracker = new Tracker(repo);

    const stats = tracker.stats(a.id);
    expect(stats?.min).toBe(60);
    expect(stats?.max).toBe(100);
    expect(stats?.savingsVsPeakPct).toBeCloseTo(40);

    const deals = tracker.deals();
    expect(deals.map((d) => d.product.name)).toEqual(["A", "B"]);
    expect(deals[0]?.discountPct).toBeCloseTo(40);
  });
});
