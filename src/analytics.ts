import type { Deal, PricePoint, PriceStats, Product } from "./types.js";

/**
 * Compute summary statistics for a series of price points. Accepts points in
 * any order. Returns `null` for an empty series.
 *
 * `nearLowThreshold` is the fraction (default 3%) within which the current
 * price is considered "at or near" the all-time low — the buy signal.
 */
export function priceStats(
  points: PricePoint[],
  nearLowThreshold = 0.03,
): PriceStats | null {
  if (points.length === 0) return null;

  const chronological = [...points].sort((a, b) =>
    a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id - b.id,
  );

  const prices = chronological.map((p) => p.price);
  const first = prices[0]!;
  const current = prices[prices.length - 1]!;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  const changePct = first === 0 ? 0 : ((current - first) / first) * 100;
  const savingsVsPeakPct = max === 0 ? 0 : ((max - current) / max) * 100;
  const atOrNearLow = min === 0 ? current === 0 : current <= min * (1 + nearLowThreshold);

  return {
    count: prices.length,
    current,
    min,
    max,
    average,
    first,
    changePct,
    savingsVsPeakPct,
    currency: chronological[chronological.length - 1]!.currency,
    atOrNearLow,
  };
}

/**
 * Rank products by current discount versus their observed peak price, biggest
 * discount first. Products with no price history are skipped. When a product
 * has a target price and the current price meets it, `hitsTarget` is true.
 */
export function rankDeals(
  entries: Array<{ product: Product; points: PricePoint[] }>,
): Deal[] {
  const deals: Deal[] = [];
  for (const { product, points } of entries) {
    const stats = priceStats(points);
    if (!stats) continue;
    deals.push({
      product,
      current: stats.current,
      peak: stats.max,
      discountPct: stats.savingsVsPeakPct,
      currency: stats.currency ?? product.currency,
      hitsTarget:
        product.targetPrice !== null && stats.current <= product.targetPrice,
    });
  }
  return deals.sort((a, b) => b.discountPct - a.discountPct);
}
