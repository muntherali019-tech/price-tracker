# price-tracker

Track product prices over time from the command line. `price-tracker` stores
the products you care about in a local SQLite database and records a price
history each time you refresh.

## Requirements

- Node.js >= 22

## Install

```bash
npm install
npm run build
```

For development you can run the CLI directly from TypeScript without building:

```bash
npm run dev -- <command>
```

## Quick start

```bash
# See it live with a realistic sample watchlist (no network needed)
price-tracker demo
price-tracker list
price-tracker deals
price-tracker stats 1
```

## Usage

### Core

```bash
# Start tracking a product (optionally with a price-drop target)
price-tracker add https://example.com/item --name "Cool Thing" --currency USD --target 199

price-tracker list                    # products with latest price + trend sparkline
price-tracker refresh 1               # fetch + record one product's price
price-tracker refresh                 # …or every product
price-tracker history 1 --limit 10    # price history with a sparkline
price-tracker remove 1
```

### Insights & revenue tools

```bash
price-tracker target 1 149            # set a price-drop alert (or `target 1 clear`)
price-tracker alerts                  # products currently at/below their target
price-tracker stats 1                 # min/max/avg, off-peak savings, buy signal
price-tracker deals                   # whole watchlist ranked by discount vs peak
price-tracker share 1                 # affiliate link for a product
price-tracker export --format md      # deal digest (also: json, csv; --out <file>)
```

Add `--json` for machine-readable output, or `--no-color` to disable ANSI.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PRICE_TRACKER_DB` | SQLite path (default `~/.price-tracker/data.db`) |
| `PRICE_TRACKER_AFFILIATE_TAG` | Affiliate/partner id used by `share` |
| `PRICE_TRACKER_AFFILIATE_TEMPLATE` | Optional link template: `{url}` `{tag}` `{domain}` |
| `PRICE_TRACKER_AI` | Set to `1` to enable the Claude fallback extractor |
| `PRICE_TRACKER_AI_MODEL` | Model id for the fallback (default `claude-opus-4-8`) |
| `ANTHROPIC_API_KEY` | API key, used when `PRICE_TRACKER_AI` is on |

## Price extraction

`refresh` fetches each product URL and extracts a price using a few common
conventions (Open Graph `og:price:amount` meta tags, schema.org
`itemprop="price"`, and a currency-symbol fallback) — a dependency-free
heuristic that runs first.

### AI fallback (opt-in)

For pages the heuristic can't parse, `price-tracker` can fall back to Claude:

```bash
export PRICE_TRACKER_AI=1
export ANTHROPIC_API_KEY=sk-...        # your key
price-tracker refresh
```

When enabled, only pages the heuristic fails on are sent to the model (default
`claude-opus-4-8`), which returns a structured `{price, currency}`. The
integration uses the official `@anthropic-ai/sdk`, declared as an **optional**
dependency and imported lazily — the default install and every test run neither
require it nor make any network calls. Install it explicitly if your environment
skips optional deps:

```bash
npm install @anthropic-ai/sdk
```

You can also wire your own extractor via the library API:
`new Tracker(repo, { ai })`.

## Development

```bash
npm run typecheck   # type-check without emitting
npm run build       # compile to dist/
npm test            # run the vitest suite
npm run test:watch  # tests in watch mode
```

See [CLAUDE.md](./CLAUDE.md) for the full architecture and conventions.
