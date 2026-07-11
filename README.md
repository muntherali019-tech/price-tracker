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

## Usage

```bash
# Start tracking a product
price-tracker add https://example.com/item --name "Cool Thing" --currency USD

# List tracked products with their latest recorded price
price-tracker list

# Fetch the current price for one product (or all of them) and record it
price-tracker refresh 1
price-tracker refresh

# Show recorded price history for a product
price-tracker history 1 --limit 10

# Stop tracking a product
price-tracker remove 1
```

The database location defaults to `~/.price-tracker/data.db` and can be
overridden with the `PRICE_TRACKER_DB` environment variable.

## Price extraction

`refresh` fetches each product URL and extracts a price using a few common
conventions (Open Graph `og:price:amount` meta tags, schema.org
`itemprop="price"`, and a currency-symbol fallback). This is a simple,
dependency-free heuristic — site-specific extraction can be added later.

## Development

```bash
npm run typecheck   # type-check without emitting
npm run build       # compile to dist/
npm test            # run the vitest suite
npm run test:watch  # tests in watch mode
```

See [CLAUDE.md](./CLAUDE.md) for the full architecture and conventions.
