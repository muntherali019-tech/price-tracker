#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db.js";
import { Repository } from "./repository.js";
import { Tracker } from "./tracker.js";

const DEFAULT_DB =
  process.env.PRICE_TRACKER_DB ?? join(homedir(), ".price-tracker", "data.db");

const USAGE = `price-tracker — track product prices over time

Usage:
  price-tracker add <url> --name <name> [--currency <code>] [--selector <sel>]
  price-tracker list
  price-tracker remove <id>
  price-tracker refresh [<id>]          Fetch current price(s) and record them
  price-tracker history <id> [--limit <n>]

Environment:
  PRICE_TRACKER_DB   Path to the SQLite database (default: ~/.price-tracker/data.db)
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

async function main(): Promise<number> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (!command || command === "help" || flags.help) {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  const db = openDatabase(DEFAULT_DB);
  const tracker = new Tracker(new Repository(db));

  try {
    switch (command) {
      case "add": {
        const url = positionals[1];
        const name = flags.name;
        if (!url || typeof name !== "string") {
          process.stderr.write("add requires <url> and --name <name>\n");
          return 1;
        }
        const product = tracker.track({
          url,
          name,
          currency: typeof flags.currency === "string" ? flags.currency : null,
          selector: typeof flags.selector === "string" ? flags.selector : null,
        });
        process.stdout.write(
          `Tracking #${product.id}: ${product.name} (${product.url})\n`,
        );
        return 0;
      }

      case "list": {
        const products = tracker.list();
        if (products.length === 0) {
          process.stdout.write("No products tracked yet.\n");
          return 0;
        }
        for (const p of products) {
          const latest = new Repository(db).getLatestPrice(p.id);
          const priceStr = latest
            ? `${latest.price}${latest.currency ? " " + latest.currency : ""} (as of ${latest.recordedAt})`
            : "no price recorded";
          process.stdout.write(`#${p.id}  ${p.name}\n    ${p.url}\n    ${priceStr}\n`);
        }
        return 0;
      }

      case "remove": {
        const id = Number(positionals[1]);
        if (!Number.isInteger(id)) {
          process.stderr.write("remove requires a numeric <id>\n");
          return 1;
        }
        const ok = tracker.untrack(id);
        process.stdout.write(ok ? `Removed #${id}\n` : `No product #${id}\n`);
        return ok ? 0 : 1;
      }

      case "refresh": {
        if (positionals[1]) {
          const id = Number(positionals[1]);
          if (!Number.isInteger(id)) {
            process.stderr.write("refresh <id> requires a numeric id\n");
            return 1;
          }
          const point = await tracker.refreshOne(id);
          process.stdout.write(
            `#${id}: recorded ${point.price}${point.currency ? " " + point.currency : ""}\n`,
          );
          return 0;
        }
        const results = await tracker.refreshAll();
        if (results.length === 0) {
          process.stdout.write("No products to refresh.\n");
          return 0;
        }
        for (const r of results) {
          if (r.point) {
            process.stdout.write(
              `#${r.product.id} ${r.product.name}: ${r.point.price}${r.point.currency ? " " + r.point.currency : ""}\n`,
            );
          } else {
            process.stdout.write(`#${r.product.id} ${r.product.name}: ERROR ${r.error}\n`);
          }
        }
        return 0;
      }

      case "history": {
        const id = Number(positionals[1]);
        if (!Number.isInteger(id)) {
          process.stderr.write("history requires a numeric <id>\n");
          return 1;
        }
        const limit =
          typeof flags.limit === "string" ? Number(flags.limit) : undefined;
        const points = tracker.history(id, limit);
        if (points.length === 0) {
          process.stdout.write(`No price history for #${id}\n`);
          return 0;
        }
        for (const pt of points) {
          process.stdout.write(
            `${pt.recordedAt}  ${pt.price}${pt.currency ? " " + pt.currency : ""}\n`,
          );
        }
        return 0;
      }

      default:
        process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  } finally {
    db.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  },
);
