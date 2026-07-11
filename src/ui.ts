/**
 * Zero-dependency terminal UI helpers: ANSI colors, a spinner, tables, and
 * unicode sparkline charts. Color is auto-disabled when stdout is not a TTY,
 * when NO_COLOR is set, or when explicitly turned off with {@link setColor}.
 */

let colorEnabled =
  !process.env.NO_COLOR && (process.stdout.isTTY ?? false);

export function setColor(enabled: boolean): void {
  colorEnabled = enabled;
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
} as const;

function wrap(code: number, s: string): string {
  return colorEnabled ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const c = {
  bold: (s: string) => wrap(CODES.bold, s),
  dim: (s: string) => wrap(CODES.dim, s),
  red: (s: string) => wrap(CODES.red, s),
  green: (s: string) => wrap(CODES.green, s),
  yellow: (s: string) => wrap(CODES.yellow, s),
  blue: (s: string) => wrap(CODES.blue, s),
  magenta: (s: string) => wrap(CODES.magenta, s),
  cyan: (s: string) => wrap(CODES.cyan, s),
  gray: (s: string) => wrap(CODES.gray, s),
};

/** Strip ANSI escape codes — used for width math and in tests. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}

/** Format a money amount with an optional currency code/symbol. */
export function money(amount: number, currency: string | null): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
  };
  const fixed = amount.toFixed(2);
  if (!currency) return fixed;
  const sym = symbols[currency];
  return sym ? `${sym}${fixed}` : `${fixed} ${currency}`;
}

/**
 * Render a unicode sparkline from a series of numbers. Flat/empty series render
 * as repeated mid-level bars. Great for showing a price trend inline.
 */
export function sparkline(values: number[]): string {
  const bars = "▁▂▃▄▅▆▇█";
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values
    .map((v) => {
      if (span === 0) return bars[3];
      const idx = Math.round(((v - min) / span) * (bars.length - 1));
      return bars[Math.max(0, Math.min(bars.length - 1, idx))];
    })
    .join("");
}

export interface TableColumn {
  header: string;
  align?: "left" | "right";
}

/** Render a simple aligned table with a dim header underline. */
export function table(columns: TableColumn[], rows: string[][]): string {
  const widths = columns.map((col, i) => {
    const cells = rows.map((r) => visibleWidth(r[i] ?? ""));
    return Math.max(visibleWidth(col.header), ...(cells.length ? cells : [0]));
  });

  const pad = (s: string, w: number, align: "left" | "right") => {
    const gap = w - visibleWidth(s);
    if (gap <= 0) return s;
    return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
  };

  const headerLine = columns
    .map((col, i) => c.bold(pad(col.header, widths[i]!, col.align ?? "left")))
    .join("  ");
  const underline = c.dim(widths.map((w) => "─".repeat(w)).join("  "));

  const body = rows
    .map((r) =>
      columns
        .map((col, i) => pad(r[i] ?? "", widths[i]!, col.align ?? "left"))
        .join("  "),
    )
    .join("\n");

  return [headerLine, underline, body].filter(Boolean).join("\n");
}

/**
 * A minimal spinner. No-ops (prints a single line at stop) when stdout is not a
 * TTY, so scripted/piped output stays clean.
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;

  constructor(private text: string) {}

  start(): this {
    if (!process.stdout.isTTY) return this;
    this.timer = setInterval(() => {
      const frame = this.frames[this.i++ % this.frames.length]!;
      process.stdout.write(`\r${c.cyan(frame)} ${this.text}`);
    }, 80);
    return this;
  }

  update(text: string): void {
    this.text = text;
  }

  stop(finalLine?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write("\r\x1b[K"); // clear the line
    }
    if (finalLine) process.stdout.write(finalLine + "\n");
  }
}
