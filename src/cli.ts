#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { openDatabase } from "./db.js";
import { Repository } from "./repository.js";
import { Tracker } from "./tracker.js";
import { seedDemo } from "./demo.js";
import { affiliateConfigFromEnv, buildAffiliateUrl } from "./affiliate.js";
import { toCsv, toJson, toMarkdownDigest, type ExportFormat } from "./export.js";
import { c, money, setColor, sparkline, Spinner, table } from "./ui.js";

const DEFAULT_DB =
  process.env.PRICE_TRACKER_DB ?? join(homedir(), ".price-tracker", "data.db");

const USAGE = `${c.bold("price-tracker")} — track product prices over time

${c.bold("Core")}
  add <url> --name <name> [--currency <code>] [--target <price>]
  list                                  Products with latest price + trend
  remove <id>
  refresh [<id>]                        Fetch current price(s) and record them
  history <id> [--limit <n>]            Price history with a sparkline

${c.bold("Insights & revenue tools")}
  target <id> <price|clear>             Set/clear a price-drop alert
  alerts                                Products currently at/below target
  stats <id>                            Savings analytics + buy signal
  deals                                 Watchlist ranked by discount vs peak
  share <id>                            Affiliate link for a product
  export [--format json|csv|md] [--out <file>]   Export data / deal digest
  demo                                  Seed a realistic sample watchlist

${c.bold("Global flags")}
  --json           Machine-readable output where supported
  --no-color       Disable ANSI colors

${c.bold("Environment")}
  PRICE_TRACKER_DB                 SQLite path (default ~/.price-tracker/data.db)
  PRICE_TRACKER_AFFILIATE_TAG      Affiliate/partner id for \`share\`
  PRICE_TRACKER_AFFILIATE_TEMPLATE Optional URL template: {url} {tag} {domain}
`;

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function out(s: string): void {
  process.stdout.write(s + "\n");
}
function err(s: string): void {
  process.stderr.write(s + "\n");
}
function emitJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function main(): Promise<number> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];
  const json = flags.json === true;
  if (flags["no-color"] === true || json) setColor(false);

  if (!command || command === "help" || flags.help) {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  const db = openDatabase(DEFAULT_DB);
  const repo = new Repository(db);
  const tracker = new Tracker(repo);

  try {
    switch (command) {
      case "add":
        return cmdAdd(tracker, positionals, flags, json);
      case "list":
        return cmdList(tracker, repo, json);
      case "remove":
        return cmdRemove(tracker, positionals);
      case "refresh":
        return await cmdRefresh(tracker, positionals, json);
      case "history":
        return cmdHistory(tracker, positionals, flags, json);
      case "target":
        return cmdTarget(tracker, positionals);
      case "alerts":
        return cmdAlerts(tracker, json);
      case "stats":
        return cmdStats(tracker, positionals, json);
      case "deals":
        return cmdDeals(tracker, json);
      case "share":
      case "affiliate":
        return cmdShare(tracker, positionals, json);
      case "export":
        return cmdExport(tracker, repo, flags);
      case "demo":
        return cmdDemo(repo, json);
      default:
        err(`Unknown command: ${command}\n`);
        process.stdout.write(USAGE);
        return 1;
    }
  } catch (e) {
    err(c.red(`Error: ${e instanceof Error ? e.message : String(e)}`));
    return 1;
  } finally {
    db.close();
  }
}

function cmdAdd(
  tracker: Tracker,
  positionals: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const url = positionals[1];
  const name = flags.name;
  if (!url || typeof name !== "string") {
    err("add requires <url> and --name <name>");
    return 1;
  }
  const product = tracker.track({
    url,
    name,
    currency: typeof flags.currency === "string" ? flags.currency : null,
    selector: typeof flags.selector === "string" ? flags.selector : null,
    targetPrice: typeof flags.target === "string" ? Number(flags.target) : null,
  });
  if (json) {
    emitJson(product);
  } else {
    out(`${c.green("✓")} Tracking ${c.bold("#" + product.id)} ${product.name}`);
    out(c.dim(`  ${product.url}`));
  }
  return 0;
}

function cmdList(tracker: Tracker, repo: Repository, json: boolean): number {
  const products = tracker.list();
  if (json) {
    emitJson(
      products.map((p) => ({
        ...p,
        latest: repo.getLatestPrice(p.id) ?? null,
      })),
    );
    return 0;
  }
  if (products.length === 0) {
    out(c.dim("No products tracked yet. Try `price-tracker demo`."));
    return 0;
  }
  const rows = products.map((p) => {
    const asc = repo.getHistoryAsc(p.id);
    const latest = asc[asc.length - 1];
    const trend = sparkline(asc.slice(-24).map((pt) => pt.price));
    const priceStr = latest ? money(latest.price, latest.currency) : "—";
    const hit = latest && p.targetPrice !== null && latest.price <= p.targetPrice;
    const target =
      p.targetPrice !== null ? money(p.targetPrice, p.currency) : c.dim("—");
    return [
      c.dim("#" + p.id),
      p.name,
      hit ? c.green(priceStr + " 🔔") : priceStr,
      c.cyan(trend),
      target,
    ];
  });
  out(
    table(
      [
        { header: "ID" },
        { header: "Product" },
        { header: "Latest", align: "right" },
        { header: "Trend" },
        { header: "Target", align: "right" },
      ],
      rows,
    ),
  );
  return 0;
}

function cmdRemove(tracker: Tracker, positionals: string[]): number {
  const id = Number(positionals[1]);
  if (!Number.isInteger(id)) {
    err("remove requires a numeric <id>");
    return 1;
  }
  const ok = tracker.untrack(id);
  out(ok ? `${c.green("✓")} Removed #${id}` : c.dim(`No product #${id}`));
  return ok ? 0 : 1;
}

async function cmdRefresh(
  tracker: Tracker,
  positionals: string[],
  json: boolean,
): Promise<number> {
  const single = positionals[1];
  if (single) {
    const id = Number(single);
    if (!Number.isInteger(id)) {
      err("refresh <id> requires a numeric id");
      return 1;
    }
    const spinner = json ? null : new Spinner(`Fetching #${id}…`).start();
    const result = await tracker.refreshOne(id);
    spinner?.stop();
    if (json) {
      emitJson(result);
    } else if (result.point) {
      const line = `#${id}: ${money(result.point.price, result.point.currency)}`;
      out(result.alert ? c.green(`🔔 ${line} — target hit!`) : `${c.green("✓")} ${line}`);
    }
    return 0;
  }

  const spinner = json ? null : new Spinner("Refreshing all products…").start();
  const results = await tracker.refreshAll();
  spinner?.stop();
  if (json) {
    emitJson(results);
    return 0;
  }
  if (results.length === 0) {
    out(c.dim("No products to refresh."));
    return 0;
  }
  for (const r of results) {
    if (r.point) {
      const line = `#${r.product.id} ${r.product.name}: ${money(r.point.price, r.point.currency)}`;
      out(r.alert ? c.green(`🔔 ${line}`) : `${c.green("✓")} ${line}`);
    } else {
      out(`${c.red("✗")} #${r.product.id} ${r.product.name}: ${c.red(r.error ?? "failed")}`);
    }
  }
  const alerts = results.filter((r) => r.alert).length;
  if (alerts > 0) out(c.green(`\n${alerts} product(s) hit their target price.`));
  return 0;
}

function cmdHistory(
  tracker: Tracker,
  positionals: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
): number {
  const id = Number(positionals[1]);
  if (!Number.isInteger(id)) {
    err("history requires a numeric <id>");
    return 1;
  }
  const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
  const points = tracker.history(id, limit);
  if (json) {
    emitJson(points);
    return 0;
  }
  if (points.length === 0) {
    out(c.dim(`No price history for #${id}`));
    return 0;
  }
  const asc = [...points].reverse();
  out(c.cyan(sparkline(asc.map((p) => p.price))));
  out(
    table(
      [{ header: "When" }, { header: "Price", align: "right" }],
      points.map((p) => [c.dim(p.recordedAt), money(p.price, p.currency)]),
    ),
  );
  return 0;
}

function cmdTarget(tracker: Tracker, positionals: string[]): number {
  const id = Number(positionals[1]);
  const value = positionals[2];
  if (!Number.isInteger(id) || value === undefined) {
    err("target requires <id> and <price|clear>");
    return 1;
  }
  const target = value === "clear" ? null : Number(value);
  if (target !== null && !Number.isFinite(target)) {
    err("target price must be a number or 'clear'");
    return 1;
  }
  const ok = tracker.setTarget(id, target);
  if (!ok) {
    err(`No product #${id}`);
    return 1;
  }
  out(
    target === null
      ? `${c.green("✓")} Cleared target for #${id}`
      : `${c.green("✓")} Alert set: notify when #${id} ≤ ${target}`,
  );
  return 0;
}

function cmdAlerts(tracker: Tracker, json: boolean): number {
  const alerts = tracker.activeAlerts();
  if (json) {
    emitJson(alerts);
    return 0;
  }
  if (alerts.length === 0) {
    out(c.dim("No active alerts — nothing at or below its target yet."));
    return 0;
  }
  for (const { product, latest } of alerts) {
    out(
      c.green(
        `🔔 #${product.id} ${product.name} — ${money(latest.price, latest.currency)} (target ${money(product.targetPrice!, product.currency)})`,
      ),
    );
  }
  return 0;
}

function cmdStats(tracker: Tracker, positionals: string[], json: boolean): number {
  const id = Number(positionals[1]);
  if (!Number.isInteger(id)) {
    err("stats requires a numeric <id>");
    return 1;
  }
  const product = tracker.get(id);
  const stats = tracker.stats(id);
  if (!product) {
    err(`No product #${id}`);
    return 1;
  }
  if (json) {
    emitJson({ product, stats });
    return 0;
  }
  if (!stats) {
    out(c.dim(`No price history for #${id} yet.`));
    return 0;
  }
  const cur = product.currency;
  out(c.bold(product.name));
  out(
    table(
      [{ header: "Metric" }, { header: "Value", align: "right" }],
      [
        ["Current", money(stats.current, cur)],
        ["All-time low", c.green(money(stats.min, cur))],
        ["All-time high", money(stats.max, cur)],
        ["Average", money(stats.average, cur)],
        ["Since first", fmtPct(stats.changePct)],
        ["Off peak", c.green(stats.savingsVsPeakPct.toFixed(1) + "%")],
        ["Data points", String(stats.count)],
      ],
    ),
  );
  out(
    stats.atOrNearLow
      ? c.green("\n▲ Buy signal: at or near the all-time low.")
      : c.dim("\n△ Above the all-time low — you may want to wait."),
  );
  return 0;
}

function cmdDeals(tracker: Tracker, json: boolean): number {
  const deals = tracker.deals().filter((d) => d.discountPct > 0.01);
  if (json) {
    emitJson(deals);
    return 0;
  }
  if (deals.length === 0) {
    out(c.dim("No deals yet — refresh some prices first."));
    return 0;
  }
  out(
    table(
      [
        { header: "Product" },
        { header: "Now", align: "right" },
        { header: "Peak", align: "right" },
        { header: "Off peak", align: "right" },
        { header: "" },
      ],
      deals.map((d) => [
        d.product.name,
        money(d.current, d.currency),
        c.dim(money(d.peak, d.currency)),
        c.green(d.discountPct.toFixed(1) + "%"),
        d.hitsTarget ? c.green("🔔 target") : "",
      ]),
    ),
  );
  return 0;
}

function cmdShare(tracker: Tracker, positionals: string[], json: boolean): number {
  const id = Number(positionals[1]);
  if (!Number.isInteger(id)) {
    err("share requires a numeric <id>");
    return 1;
  }
  const product = tracker.get(id);
  if (!product) {
    err(`No product #${id}`);
    return 1;
  }
  const config = affiliateConfigFromEnv();
  const link = buildAffiliateUrl(product.url, config);
  if (json) {
    emitJson({ id, url: product.url, affiliateUrl: link, tagged: link !== product.url });
    return 0;
  }
  out(link);
  if (link === product.url) {
    err(
      c.dim(
        "  (no affiliate tag set — export PRICE_TRACKER_AFFILIATE_TAG to enable)",
      ),
    );
  }
  return 0;
}

function cmdExport(
  tracker: Tracker,
  repo: Repository,
  flags: Record<string, string | boolean>,
): number {
  const format = (typeof flags.format === "string" ? flags.format : "json") as ExportFormat;
  const products = tracker.list();
  let content: string;

  if (format === "md") {
    content = toMarkdownDigest(tracker.deals().filter((d) => d.discountPct > 0.01));
  } else {
    const data = products.map((product) => ({
      product,
      history: repo.getHistoryAsc(product.id),
    }));
    if (format === "csv") content = toCsv(data);
    else if (format === "json") content = toJson(data);
    else {
      err(`Unknown format: ${format} (use json|csv|md)`);
      return 1;
    }
  }

  if (typeof flags.out === "string") {
    writeFileSync(flags.out, content);
    out(`${c.green("✓")} Wrote ${format.toUpperCase()} to ${flags.out}`);
  } else {
    process.stdout.write(content.endsWith("\n") ? content : content + "\n");
  }
  return 0;
}

function cmdDemo(repo: Repository, json: boolean): number {
  const result = seedDemo(repo);
  if (json) {
    emitJson(result);
    return 0;
  }
  out(
    `${c.green("✓")} Seeded ${c.bold(String(result.products))} products with ${c.bold(String(result.points))} price points.`,
  );
  out(c.dim("Try: price-tracker list · price-tracker deals · price-tracker stats 1"));
  return 0;
}

function fmtPct(pct: number): string {
  const s = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  return pct <= 0 ? c.green(s) : c.red(s);
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`Fatal: ${e}\n`);
    process.exit(1);
  },
);
