# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

`price-tracker` is a command-line tool that tracks product prices over time. It
stores tracked products and their price history in a local SQLite database, and
can fetch the current price from a product URL on demand.

**Stack:** TypeScript (ESM) on Node.js ≥ 22, SQLite via `better-sqlite3`, tests
with Vitest. Built with `tsc` to `dist/`.

## Project layout

```
price-tracker/
├── src/
│   ├── cli.ts          # CLI entry point: arg parsing + command dispatch
│   ├── index.ts        # public library exports
│   ├── tracker.ts      # Tracker: high-level ops composing repo + fetcher
│   ├── repository.ts   # Repository: SQLite data access (products, history)
│   ├── db.ts           # openDatabase(): connection + schema migration
│   ├── fetcher.ts      # fetchPrice()/extractPrice(): extraction + AI fallback
│   ├── analytics.ts    # priceStats()/rankDeals(): pure stats over history
│   ├── affiliate.ts    # buildAffiliateUrl(): affiliate link generation
│   ├── export.ts       # toJson/toCsv/toMarkdownDigest(): data + deal exports
│   ├── ui.ts           # zero-dep terminal UI: colors, table, sparkline, spinner
│   ├── demo.ts         # seedDemo(): realistic sample catalog + price history
│   └── types.ts        # shared interfaces (Product, PricePoint, AiExtractor, …)
├── tests/
│   ├── tracker.test.ts   # Repository + Tracker behavior (in-memory DB)
│   ├── fetcher.test.ts   # price parsing/extraction, fetch + AI fallback
│   ├── analytics.test.ts # priceStats / rankDeals pure logic
│   └── tools.test.ts     # affiliate, exporters, ui helpers, demo seeding
├── dist/               # build output (gitignored)
├── package.json
├── tsconfig.json       # strict, NodeNext modules, noUncheckedIndexedAccess
├── vitest.config.ts
└── README.md
```

## Architecture

The code is layered, each layer depending only on the one below it:

- **`db.ts`** owns the SQLite connection and the schema. The schema lives in the
  `migrate()` function as idempotent `CREATE TABLE IF NOT EXISTS` statements.
  Two tables: `products` and `price_history` (FK to products, `ON DELETE
  CASCADE`). `PRAGMA foreign_keys = ON` is set on every connection.
- **`repository.ts`** (`Repository`) is the only place that runs SQL. It maps
  `snake_case` DB rows to `camelCase` domain objects (`toProduct`,
  `toPricePoint`). Add new queries here, not in higher layers.
- **`fetcher.ts`** is pure-ish price logic. `extractPrice(html)` is a pure
  function (fully unit-tested); `fetchPrice(url, options)` wraps it with a
  network call. `options` carries an injectable `fetchImpl` (for tests) and an
  optional `ai` extractor (see below). The heuristic runs first; the AI runs
  only as a fallback when it finds nothing.
- **`analytics.ts`** is pure math over `PricePoint[]`: `priceStats()` (min/max/
  average/change/off-peak savings + buy signal) and `rankDeals()`.
- **`affiliate.ts`**, **`export.ts`**, **`demo.ts`**, **`ui.ts`** are leaf
  utilities: affiliate-link building, JSON/CSV/Markdown export, sample-data
  seeding, and zero-dependency terminal rendering respectively. All pure/leaf
  and independently unit-tested; none touch the DB except `demo.ts` via a
  passed-in `Repository`.
- **`tracker.ts`** (`Tracker`) composes `Repository` + fetcher + analytics into
  the operations the CLI needs (`track`, `list`, `untrack`, `history`,
  `setTarget`, `stats`, `deals`, `activeAlerts`, `refreshOne`, `refreshAll`).
  Business rules (duplicate-URL rejection, target-alert evaluation) live here.
- **`cli.ts`** is a thin argument parser + dispatcher. It should contain no
  business logic — delegate to `Tracker` and the leaf utilities.

### AI price extraction (injectable, no hard dependency)

`AiExtractor` (in `types.ts`) is a `(html, ctx) => Promise<ExtractedPrice | null>`
hook. It is **off by default** — the shipped build adds no model SDK and makes
no external calls. To wire a model in, construct `new Tracker(repo, { ai })`
with a function that calls your provider. Keep the heuristic as the fast path;
the AI is a fallback only. Never hit a real model (or network) in tests — pass a
fake `ai` just like `fetchImpl`.

## Development workflow

```bash
npm install         # installs deps (better-sqlite3 builds a native addon)
npm run dev -- add https://example.com --name X   # run CLI from TS via tsx
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
npm test            # vitest run
npm run test:watch  # vitest in watch mode
```

Runtime config: `PRICE_TRACKER_DB` overrides the DB path (default
`~/.price-tracker/data.db`). Tests use an in-memory DB (`openDatabase(":memory:")`).

## Conventions

- **ESM + NodeNext.** `"type": "module"`; relative imports **must** use `.js`
  extensions (e.g. `import { Repository } from "./repository.js"`) even though
  the source is `.ts`. This is required by NodeNext resolution.
- **Strict TypeScript.** `strict` and `noUncheckedIndexedAccess` are on, so
  indexing/regex-capture results are `T | undefined` — guard before use rather
  than asserting non-null.
- **Keep SQL in the Repository.** Higher layers never touch the `db` directly.
- **Inject `fetch` for tests.** Anything doing network I/O takes a `fetchImpl`
  parameter defaulting to the global `fetch`; tests pass a fake returning a
  `Response`. Do not hit the real network in tests.
- **Testing.** Tests live in `tests/` and import from `../src/*.js`. Cover pure
  logic directly (parsing/extraction) and behavior against an in-memory DB.
- **Keep docs honest.** Update this file and `README.md` in the same change as
  any structural change (new command, new module, schema change).

## Extending the tool — where things go

- **New CLI command:** add a `case` in `cli.ts`, implement the logic as a method
  on `Tracker`, and add data access to `Repository` if needed.
- **New DB column/table:** edit the schema in `db.ts`'s `migrate()`, update the
  row interfaces and mappers in `repository.ts`, and the types in `types.ts`.
  There is no versioned migration system — DDL is idempotent (`CREATE ... IF NOT
  EXISTS`). For a new column on an existing table, add an `ensureColumn()` call
  in `migrate()` (SQLite has no `ADD COLUMN IF NOT EXISTS`, so it guards on
  `PRAGMA table_info`). This is how `products.target_price` is added.
- **New analytics/insight:** add a pure function in `analytics.ts` over
  `PricePoint[]`, expose it via a `Tracker` method, then surface it in `cli.ts`.
- **New revenue tool:** the four monetisation-oriented features are price-drop
  alerts (`target`/`alerts`, backed by `products.target_price`), affiliate links
  (`affiliate.ts` + `share`), data/deal exports (`export.ts` + `export`), and
  savings analytics (`analytics.ts` + `stats`/`deals`). Add new ones as leaf
  modules + a `Tracker` method + a CLI `case`.
- **Better price extraction:** extend `extractPrice()` in `fetcher.ts`. The
  `Product.selector` field exists as a hook for future site-specific extraction
  but is not yet used.

## Git workflow

- **Default branch:** `main`. Do all work on a dedicated feature branch; never
  commit directly to `main`.
- **Commits:** small, focused, clear messages.
- **Push:** `git push -u origin <branch>`; retry network failures with
  exponential backoff (2s, 4s, 8s, 16s).
- **Pull requests:** only open one when explicitly asked; follow any
  `.github/` PR template.
- **Merged branch = finished.** If this branch's PR is already merged, restart
  the branch from the latest `main` for follow-up work instead of stacking new
  commits on merged history.
