import type { Deal, PricePoint, Product } from "./types.js";

export type ExportFormat = "json" | "csv" | "md";

export interface ProductExport {
  product: Product;
  history: PricePoint[];
}

/** Serialize the full watchlist + history as pretty JSON. */
export function toJson(data: ProductExport[]): string {
  return JSON.stringify(data, null, 2);
}

/** Flatten every price point across products into a CSV table. */
export function toCsv(data: ProductExport[]): string {
  const rows: string[] = [
    "product_id,name,url,recorded_at,price,currency",
  ];
  for (const { product, history } of data) {
    for (const pt of history) {
      rows.push(
        [
          product.id,
          csvCell(product.name),
          csvCell(product.url),
          pt.recordedAt,
          pt.price,
          pt.currency ?? "",
        ].join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}

/**
 * A shareable Markdown "deal digest" — the kind of content a price tracker
 * turns into a newsletter or affiliate landing page.
 */
export function toMarkdownDigest(deals: Deal[], title = "Today's Best Deals"): string {
  const lines: string[] = [`# ${title}`, ""];
  if (deals.length === 0) {
    lines.push("_No deals to report yet — add products and refresh prices._", "");
    return lines.join("\n");
  }
  lines.push("| # | Product | Price | Off peak | Target hit |");
  lines.push("| - | ------- | ----- | -------- | ---------- |");
  deals.forEach((d, i) => {
    const price = `${d.current.toFixed(2)}${d.currency ? " " + d.currency : ""}`;
    lines.push(
      `| ${i + 1} | [${mdCell(d.product.name)}](${d.product.url}) | ${price} | ${d.discountPct.toFixed(1)}% | ${d.hitsTarget ? "✅" : ""} |`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function mdCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("]", "\\]");
}
