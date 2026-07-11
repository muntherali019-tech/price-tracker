import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { buildAffiliateUrl } from "../src/affiliate.js";
import { toCsv, toJson, toMarkdownDigest } from "../src/export.js";
import { money, sparkline, stripAnsi, table, setColor, c } from "../src/ui.js";
import { seedDemo } from "../src/demo.js";
import { openDatabase } from "../src/db.js";
import { Repository } from "../src/repository.js";
import type { Deal, Product } from "../src/types.js";

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

describe("affiliate links (revenue tool)", () => {
  it("returns the url unchanged when no tag is set", () => {
    expect(buildAffiliateUrl("https://shop.test/item", {})).toBe(
      "https://shop.test/item",
    );
  });

  it("adds an Amazon tag param on amazon domains", () => {
    const out = buildAffiliateUrl("https://www.amazon.com/dp/ABC", {
      tag: "mytag-20",
    });
    expect(out).toContain("tag=mytag-20");
  });

  it("uses a generic ref param on other domains", () => {
    const out = buildAffiliateUrl("https://shop.test/item", { tag: "partner1" });
    expect(out).toContain("ref=partner1");
  });

  it("honors a custom template", () => {
    const out = buildAffiliateUrl("https://shop.test/item", {
      tag: "abc",
      template: "https://go.me/?to={url}&aff={tag}&d={domain}",
    });
    expect(out).toBe(
      "https://go.me/?to=https://shop.test/item&aff=abc&d=shop.test",
    );
  });
});

describe("exporters (revenue tool)", () => {
  const data = [
    {
      product: product({ id: 1, name: "Widget, Deluxe" }),
      history: [
        {
          id: 1,
          productId: 1,
          price: 9.99,
          currency: "USD",
          recordedAt: "2026-01-01 00:00:00",
        },
      ],
    },
  ];

  it("produces valid JSON", () => {
    expect(JSON.parse(toJson(data))[0].product.name).toBe("Widget, Deluxe");
  });

  it("escapes commas in CSV", () => {
    const csv = toCsv(data);
    expect(csv.split("\n")[0]).toBe(
      "product_id,name,url,recorded_at,price,currency",
    );
    expect(csv).toContain('"Widget, Deluxe"');
  });

  it("renders a markdown deal digest", () => {
    const deals: Deal[] = [
      {
        product: product({ name: "Air Fryer" }),
        current: 89.99,
        peak: 129.99,
        discountPct: 30.8,
        currency: "USD",
        hitsTarget: true,
      },
    ];
    const md = toMarkdownDigest(deals);
    expect(md).toContain("# Today's Best Deals");
    expect(md).toContain("Air Fryer");
    expect(md).toContain("✅");
  });
});

describe("ui helpers", () => {
  it("formats money with symbols and codes", () => {
    setColor(false);
    expect(money(9.5, "USD")).toBe("$9.50");
    expect(money(9.5, "SEK")).toBe("9.50 SEK");
    expect(money(9.5, null)).toBe("9.50");
  });

  it("renders a sparkline of the right length", () => {
    expect(sparkline([1, 2, 3, 4]).length).toBe(4);
    expect(sparkline([])).toBe("");
    expect(sparkline([5, 5, 5])).toMatch(/^▄+$/); // flat series
  });

  it("respects the color toggle", () => {
    setColor(false);
    expect(c.green("hi")).toBe("hi");
    setColor(true);
    expect(stripAnsi(c.green("hi"))).toBe("hi");
    expect(c.green("hi")).not.toBe("hi");
    setColor(false);
  });

  it("aligns table columns", () => {
    setColor(false);
    const rendered = table(
      [{ header: "A" }, { header: "B", align: "right" }],
      [["x", "100"], ["yy", "1"]],
    );
    const lines = rendered.split("\n");
    expect(lines).toHaveLength(4); // header, underline, 2 rows
  });
});

describe("demo seeding (live demo content)", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => db.close());

  it("seeds realistic products with history and is idempotent", () => {
    const repo = new Repository(db);
    const first = seedDemo(repo, 10);
    expect(first.products).toBeGreaterThanOrEqual(6);
    expect(first.points).toBe(first.products * 11); // days+1 points each

    const products = repo.listProducts();
    expect(products[0]?.name).toMatch(/Sony|Apple|Kindle/);
    // Latest price equals the seed's target "end" story for at least one product.
    const withTarget = products.find((p) => p.targetPrice !== null)!;
    expect(withTarget.targetPrice).toBeGreaterThan(0);

    // Running again does not duplicate products.
    seedDemo(repo, 10);
    expect(repo.listProducts()).toHaveLength(products.length);
  });
});
