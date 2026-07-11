import type { Repository } from "./repository.js";

interface DemoSeed {
  name: string;
  url: string;
  currency: string;
  /** Starting (list) price. */
  start: number;
  /** Most recent price — the story each product tells. */
  end: number;
  /** Optional target price to demonstrate drop alerts. */
  target?: number;
  /** Deterministic wiggle amplitude as a fraction of price. */
  volatility: number;
}

/**
 * Realistic sample catalog — real product names and plausible price arcs, not
 * lorem ipsum. Used by the `demo` command to make the tool feel alive on a
 * fresh install.
 */
const CATALOG: DemoSeed[] = [
  {
    name: "Sony WH-1000XM5 Wireless Headphones",
    url: "https://www.amazon.com/dp/B09XS7JWHH",
    currency: "USD",
    start: 399.99,
    end: 328.0,
    target: 330.0,
    volatility: 0.04,
  },
  {
    name: "Apple AirPods Pro (2nd Generation)",
    url: "https://www.apple.com/shop/product/MTJV3AM/A",
    currency: "USD",
    start: 249.0,
    end: 189.99,
    target: 199.0,
    volatility: 0.03,
  },
  {
    name: "Kindle Paperwhite 16GB (2024)",
    url: "https://www.amazon.com/dp/B0CFPJYX7P",
    currency: "USD",
    start: 159.99,
    end: 114.99,
    volatility: 0.05,
  },
  {
    name: "Ninja Air Fryer Pro 5-QT AF141",
    url: "https://www.ninjakitchen.com/products/af141",
    currency: "USD",
    start: 129.99,
    end: 89.99,
    target: 90.0,
    volatility: 0.06,
  },
  {
    name: "Logitech MX Master 3S Mouse",
    url: "https://www.logitech.com/products/mx-master-3s.html",
    currency: "USD",
    start: 99.99,
    end: 82.49,
    volatility: 0.03,
  },
  {
    name: "LEGO Icons Millennium Falcon 75192",
    url: "https://www.lego.com/product/75192",
    currency: "USD",
    start: 169.99,
    end: 169.99,
    volatility: 0.01,
  },
  {
    name: "Instant Pot Duo 7-in-1 6QT",
    url: "https://www.instantbrands.com/products/duo-6qt",
    currency: "USD",
    start: 99.95,
    end: 59.95,
    target: 65.0,
    volatility: 0.07,
  },
  {
    name: "Anker 737 Power Bank (PowerCore 24K)",
    url: "https://www.anker.com/products/a1289",
    currency: "USD",
    start: 149.99,
    end: 99.99,
    volatility: 0.05,
  },
];

/** Deterministic pseudo-random in [0,1) from an integer seed (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export interface DemoResult {
  products: number;
  points: number;
}

/**
 * Seed the database with the demo catalog and a believable ~30-day price
 * history for each product. Deterministic given the same catalog, so the demo
 * looks the same on every run.
 */
export function seedDemo(repo: Repository, days = 30): DemoResult {
  let points = 0;
  CATALOG.forEach((seed, index) => {
    const existing = repo.findProductByUrl(seed.url);
    const product =
      existing ??
      repo.addProduct({
        name: seed.name,
        url: seed.url,
        currency: seed.currency,
        targetPrice: seed.target ?? null,
      });

    const rand = rng(index * 1000 + 7);
    for (let day = days; day >= 0; day--) {
      const progress = 1 - day / days; // 0 -> 1 over the window
      const base = seed.start + (seed.end - seed.start) * progress;
      const wiggle = (rand() - 0.5) * 2 * seed.volatility * base;
      // Keep the final point exactly at `end` for a clean current price.
      const price = day === 0 ? seed.end : Math.max(0.01, base + wiggle);
      repo.recordPrice(
        product.id,
        Math.round(price * 100) / 100,
        seed.currency,
        isoDaysAgo(day),
      );
      points++;
    }
  });
  return { products: CATALOG.length, points };
}
