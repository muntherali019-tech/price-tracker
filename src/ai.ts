import type { AiExtractor, ExtractedPrice } from "./types.js";

/**
 * Real AI price extractor, backed by Claude via the official `@anthropic-ai/sdk`.
 *
 * This is the opt-in fallback for pages whose price the heuristic in
 * `fetcher.ts` cannot parse. To keep the default build dependency-free (see
 * CLAUDE.md), the SDK is an **optional** dependency, imported lazily the first
 * time the extractor actually runs — enabling it costs nothing until a page
 * defeats the heuristic. Tests inject a fake `complete`, so no SDK or network
 * is ever touched in the suite.
 */

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_HTML_CHARS = 60_000;

const SYSTEM_PROMPT = `You extract the current selling price of the primary product from a web page's HTML.
Rules:
- Return ONLY a compact JSON object: {"price": <number>|null, "currency": <ISO 4217 code>|null}.
- "price" is the current price a shopper pays now (prefer sale/current over list/was), as a plain number with no thousands separators or symbols.
- "currency" is the 3-letter code (e.g. "USD", "EUR", "GBP"). Use null if it cannot be determined.
- If there is no clear product price, return {"price": null, "currency": null}.
- Output no prose, no markdown, no code fences — just the JSON object.`;

export interface ClaudeExtractorOptions {
  /** API key. Falls back to the SDK's own resolution (ANTHROPIC_API_KEY, etc.). */
  apiKey?: string;
  /** Model id. Defaults to PRICE_TRACKER_AI_MODEL or `claude-opus-4-8`. */
  model?: string;
  /** Truncate HTML to this many characters before sending, to bound tokens. */
  maxHtmlChars?: number;
  /**
   * Injectable completion function: given the user prompt, return the model's
   * raw text reply. Defaults to a lazily-imported Claude client. Tests pass a
   * fake here so the SDK is never loaded.
   */
  complete?: (prompt: string) => Promise<string>;
}

/** Build the injectable `AiExtractor` used by `Tracker`/`fetchPrice`. */
export function createClaudeExtractor(
  options: ClaudeExtractorOptions = {},
): AiExtractor {
  const model =
    options.model ?? process.env.PRICE_TRACKER_AI_MODEL ?? DEFAULT_MODEL;
  const maxHtmlChars = options.maxHtmlChars ?? DEFAULT_MAX_HTML_CHARS;
  const complete = options.complete ?? defaultComplete(options.apiKey, model);

  return async (html, ctx) => {
    const prompt = buildExtractionPrompt(cleanHtml(html, maxHtmlChars), ctx.url);
    const text = await complete(prompt);
    return parseModelJson(text);
  };
}

/**
 * Construct an extractor from the environment, or `undefined` when AI is not
 * enabled. Enable by setting `PRICE_TRACKER_AI=1` (the SDK reads
 * `ANTHROPIC_API_KEY` itself). Optionally set `PRICE_TRACKER_AI_MODEL`.
 */
export function aiExtractorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AiExtractor | undefined {
  const flag = (env.PRICE_TRACKER_AI ?? "").trim().toLowerCase();
  if (!["1", "true", "on", "yes"].includes(flag)) return undefined;
  return createClaudeExtractor({ model: env.PRICE_TRACKER_AI_MODEL });
}

/** Strip scripts/styles/comments and collapse whitespace, then truncate. */
export function cleanHtml(html: string, maxChars = DEFAULT_MAX_HTML_CHARS): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars) : stripped;
}

export function buildExtractionPrompt(cleanedHtml: string, url?: string): string {
  const header = url ? `Product URL: ${url}\n\n` : "";
  return `${header}Extract the current product price from this HTML:\n\n${cleanedHtml}`;
}

/**
 * Parse the model's reply into an `ExtractedPrice`, tolerating stray prose or
 * code fences around the JSON. Returns `null` when no usable price is present.
 */
export function parseModelJson(text: string): ExtractedPrice | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const price =
    typeof record.price === "number"
      ? record.price
      : typeof record.price === "string"
        ? Number(record.price)
        : null;
  if (price === null || !Number.isFinite(price)) return null;

  const currency =
    typeof record.currency === "string" && record.currency.trim()
      ? record.currency.trim().toUpperCase()
      : null;
  return { price, currency };
}

function defaultComplete(
  apiKey: string | undefined,
  model: string,
): (prompt: string) => Promise<string> {
  let clientPromise: Promise<AnthropicLike> | null = null;

  return async (prompt) => {
    if (!clientPromise) {
      // Non-literal specifier so `tsc` treats the optional dependency as `any`
      // and does not require it to be installed for the core build.
      const specifier = "@anthropic-ai/sdk";
      clientPromise = import(specifier)
        .then((mod: { default: new (opts?: { apiKey?: string }) => AnthropicLike }) => {
          const Ctor = mod.default;
          return new Ctor(apiKey ? { apiKey } : {});
        })
        .catch(() => {
          throw new Error(
            "AI extraction requires the '@anthropic-ai/sdk' package. Install it with `npm install @anthropic-ai/sdk` and set ANTHROPIC_API_KEY.",
          );
        });
    }
    const client = await clientPromise;
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    return (res.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  };
}

/** Minimal structural type for the slice of the SDK we use. */
interface AnthropicLike {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      output_config?: { effort?: string };
      system?: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{ content?: Array<{ type: string; text?: string }> }>;
  };
}
