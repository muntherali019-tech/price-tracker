import { describe, expect, it } from "vitest";
import { priceStats, rankDeals } from "../src/analytics.js";
import type { PricePoint, Product } from "../src/types.js";

function points(prices: number[]): PricePoint[] {
  return prices.map((price, i) => ({
    id: i + 1,
    productId: 1,
    price,
    currency: "USD",
    recordedAt: `2026-01-${String(i + 1).padStart(2, "0")} 00:00:00`,
  }));
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Thing",
    url: "https://x.test/thing",
    selector: null,
    currency: "USD",
    targetPrice: null,
    createdAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

describe("priceStats", () => {
  it("returns null for empty input", () => {
    expect(priceStats([])).toBeNull();
  });

  it("computes min/max/avg/change and savings", () => {
    const stats = priceStats(points([100, 80, 120, 90]))!;
    expect(stats.first).toBe(100);
    expect(stats.current).toBe(90);
    expect(stats.min).toBe(80);
    expect(stats.max).toBe(120);
    expect(stats.average).toBeCloseTo(97.5);
    expect(stats.changePct).toBeCloseTo(-10);
    expect(stats.savingsVsPeakPct).toBeCloseTo(25);
  });

  it("flags a buy signal at or near the all-time low", () => {
    expect(priceStats(points([100, 80, 90]))!.atOrNearLow).toBe(false); // 12.5% above low
    expect(priceStats(points([100, 80]))!.atOrNearLow).toBe(true); // at the low
    expect(priceStats(points([100, 80, 82]), 0.03)!.atOrNearLow).toBe(true); // within 3%
  });

  it("is order-independent", () => {
    const ascending = priceStats(points([100, 80, 90]))!;
    const shuffled = priceStats([...points([100, 80, 90])].reverse())!;
    expect(shuffled.current).toBe(ascending.current);
    expect(shuffled.min).toBe(ascending.min);
  });
});

describe("rankDeals", () => {
  it("orders by discount vs peak and marks target hits", () => {
    const deals = rankDeals([
      { product: product({ id: 1, name: "A" }), points: points([100, 60]) },
      {
        product: product({ id: 2, name: "B", targetPrice: 40 }),
        points: points([50, 38]),
      },
      { product: product({ id: 3, name: "C" }), points: [] },
    ]);
    expect(deals.map((d) => d.product.name)).toEqual(["A", "B"]); // C skipped (no history)
    expect(deals[0]?.discountPct).toBeCloseTo(40);
    expect(deals.find((d) => d.product.name === "B")?.hitsTarget).toBe(true);
  });
});
