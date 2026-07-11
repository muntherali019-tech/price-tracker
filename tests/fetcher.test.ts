import { describe, expect, it } from "vitest";
import { extractPrice, parseAmount, fetchPrice } from "../src/fetcher.js";

describe("parseAmount", () => {
  it("parses US-formatted amounts", () => {
    expect(parseAmount("1,299.00")).toBe(1299);
    expect(parseAmount("$49.99")).toBe(49.99);
  });

  it("parses EU-formatted amounts", () => {
    expect(parseAmount("1.299,00")).toBe(1299);
    expect(parseAmount("49,99 €")).toBe(49.99);
  });

  it("returns null for junk", () => {
    expect(parseAmount("free")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("extractPrice", () => {
  it("reads Open Graph price meta tags", () => {
    const html = `
      <meta property="og:price:amount" content="19.95" />
      <meta property="og:price:currency" content="usd" />`;
    expect(extractPrice(html)).toEqual({ price: 19.95, currency: "USD" });
  });

  it("reads schema.org itemprop price", () => {
    const html = `<span itemprop="price" content="129.00">$129.00</span>
      <meta itemprop="priceCurrency" content="EUR">`;
    expect(extractPrice(html)).toEqual({ price: 129, currency: "EUR" });
  });

  it("falls back to an inline currency amount", () => {
    const html = `<div class="cost">Only £8.50 today!</div>`;
    expect(extractPrice(html)).toEqual({ price: 8.5, currency: "GBP" });
  });

  it("returns null when no price is present", () => {
    expect(extractPrice("<p>coming soon</p>")).toBeNull();
  });
});

describe("fetchPrice", () => {
  it("extracts a price from a fetched page", async () => {
    const fakeFetch = (async () =>
      new Response(`<meta property="og:price:amount" content="12.00">`, {
        status: 200,
      })) as unknown as typeof fetch;
    const result = await fetchPrice("https://example.com/item", {
      fetchImpl: fakeFetch,
    });
    expect(result?.price).toBe(12);
  });

  it("throws on a non-OK response", async () => {
    const fakeFetch = (async () =>
      new Response("nope", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch;
    await expect(
      fetchPrice("https://example.com/x", { fetchImpl: fakeFetch }),
    ).rejects.toThrow(/404/);
  });

  it("falls back to the injected AI extractor when the heuristic finds nothing", async () => {
    const fakeFetch = (async () =>
      new Response("<p>no machine-readable price here</p>", {
        status: 200,
      })) as unknown as typeof fetch;
    const ai = async () => ({ price: 77.5, currency: "USD" });
    const result = await fetchPrice("https://example.com/x", {
      fetchImpl: fakeFetch,
      ai,
    });
    expect(result).toEqual({ price: 77.5, currency: "USD" });
  });

  it("prefers the heuristic over the AI extractor when both could match", async () => {
    const fakeFetch = (async () =>
      new Response(`<meta property="og:price:amount" content="5.00">`, {
        status: 200,
      })) as unknown as typeof fetch;
    const ai = async () => ({ price: 999, currency: "USD" });
    const result = await fetchPrice("https://example.com/x", {
      fetchImpl: fakeFetch,
      ai,
    });
    expect(result?.price).toBe(5);
  });
});
