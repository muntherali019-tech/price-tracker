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
│   ├── fetcher.ts      # fetchPrice()/extractPrice(): price extraction heuristics
│   └── types.ts        # shared interfaces (Product, PricePoint, …)
├── tests/
│   ├── tracker.test.ts # Repository + Tracker behavior (in-memory DB)
│   └── fetcher.test.ts # price parsing/extraction, fetch error handling
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
  function (fully unit-tested); `fetchPrice(url, fetchImpl?)` wraps it with a
  network call and accepts an injectable `fetchImpl` for testing.
- **`tracker.ts`** (`Tracker`) composes `Repository` + fetcher into the
  operations the CLI needs (`track`, `list`, `untrack`, `history`, `refreshOne`,
  `refreshAll`). Business rules (e.g. rejecting duplicate URLs) live here.
- **`cli.ts`** is a thin argument parser + dispatcher. It should contain no
  business logic — delegate to `Tracker`.

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
  (There is no versioned migration system yet — statements are idempotent DDL.)
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
