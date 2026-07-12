import { describe, expect, it } from "vitest";
import {
  aiExtractorFromEnv,
  buildExtractionPrompt,
  cleanHtml,
  createClaudeExtractor,
  parseModelJson,
} from "../src/ai.js";
import { fetchPrice } from "../src/fetcher.js";

describe("cleanHtml", () => {
  it("strips scripts, styles, and comments and collapses whitespace", () => {
    const html = `
      <style>.x{color:red}</style>
      <script>track(1)</script>
      <!-- hidden -->
      <div>   Price:   $10   </div>`;
    const out = cleanHtml(html);
    expect(out).not.toMatch(/track|color:red|hidden/);
    expect(out).toContain("Price: $10");
    expect(out).not.toMatch(/\s{2,}/);
  });

  it("truncates to the character budget", () => {
    expect(cleanHtml("a".repeat(100), 10)).toHaveLength(10);
  });
});

describe("buildExtractionPrompt", () => {
  it("includes the URL and the cleaned HTML", () => {
    const prompt = buildExtractionPrompt("<b>cheap</b>", "https://x.test/p");
    expect(prompt).toContain("https://x.test/p");
    expect(prompt).toContain("<b>cheap</b>");
  });
});

describe("parseModelJson", () => {
  it("parses a plain JSON object", () => {
    expect(parseModelJson('{"price": 12.5, "currency": "usd"}')).toEqual({
      price: 12.5,
      currency: "USD",
    });
  });

  it("tolerates code fences and surrounding prose", () => {
    const reply = 'Here you go:\n```json\n{"price": 7, "currency": "EUR"}\n```';
    expect(parseModelJson(reply)).toEqual({ price: 7, currency: "EUR" });
  });

  it("coerces a stringified price and allows null currency", () => {
    expect(parseModelJson('{"price": "99.99", "currency": null}')).toEqual({
      price: 99.99,
      currency: null,
    });
  });

  it("returns null when no price is present", () => {
    expect(parseModelJson('{"price": null, "currency": null}')).toBeNull();
    expect(parseModelJson("no json here")).toBeNull();
    expect(parseModelJson('{"price": "free"}')).toBeNull();
  });
});

describe("createClaudeExtractor (with injected completion)", () => {
  it("cleans the html, prompts, and parses the reply", async () => {
    const seen: string[] = [];
    const extractor = createClaudeExtractor({
      complete: async (prompt) => {
        seen.push(prompt);
        return '{"price": 42.00, "currency": "USD"}';
      },
    });
    const result = await extractor("<script>x</script><p>$42</p>", {
      url: "https://x.test/item",
    });
    expect(result).toEqual({ price: 42, currency: "USD" });
    expect(seen[0]).toContain("https://x.test/item");
    expect(seen[0]).not.toContain("<script>");
  });

  it("works as the fetchPrice AI fallback when the heuristic fails", async () => {
    const fakeFetch = (async () =>
      new Response("<p>no machine-readable price</p>", {
        status: 200,
      })) as unknown as typeof fetch;
    const ai = createClaudeExtractor({
      complete: async () => '{"price": 15.75, "currency": "GBP"}',
    });
    const result = await fetchPrice("https://x.test/item", {
      fetchImpl: fakeFetch,
      ai,
    });
    expect(result).toEqual({ price: 15.75, currency: "GBP" });
  });
});

describe("aiExtractorFromEnv", () => {
  it("is undefined unless explicitly enabled", () => {
    expect(aiExtractorFromEnv({})).toBeUndefined();
    expect(aiExtractorFromEnv({ ANTHROPIC_API_KEY: "sk-x" })).toBeUndefined();
  });

  it("is defined when PRICE_TRACKER_AI is truthy", () => {
    expect(aiExtractorFromEnv({ PRICE_TRACKER_AI: "1" })).toBeTypeOf("function");
    expect(aiExtractorFromEnv({ PRICE_TRACKER_AI: "true" })).toBeTypeOf(
      "function",
    );
  });
});
