export function toCents(amount: number | string): number {
  const n = typeof amount === "string" ? Number(amount.replace(/[^0-9.]/g, "")) : amount;
  if (!Number.isFinite(n) || n <= 0) throw new Error("Amount must be a positive number");
  return Math.round(n * 100);
}

export function centsToValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

export function money(cents: number, currency = "USD"): string {
  const sym = symbols[currency];
  const v = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${v}` : `${v} ${currency}`;
}

export type CurrencyMeta = { code: string; symbol: string; decimals: number; presets: number[] };

/** Symbol, decimal places and sensible quick-pick amounts for a currency (e.g. USD → $, 2, [10,20,50,100]). */
export function currencyMeta(currency: string): CurrencyMeta {
  const code = (currency || "USD").toUpperCase();
  let symbol = code;
  let decimals = 2;
  try {
    const f = new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" });
    symbol = f.formatToParts(1).find((p) => p.type === "currency")?.value ?? code;
    decimals = f.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    /* unknown code: fall back to the code itself */
  }
  // Scale quick picks to the currency: roughly $10–$100 worth for strong currencies, bigger round numbers otherwise.
  const big: Record<string, number> = { JPY: 100, HUF: 100, INR: 50, PHP: 50, THB: 30, TWD: 30, MXN: 20, CZK: 20, KES: 100, TZS: 2500, UGX: 3500 };
  const m = big[code] ?? 1;
  const presets = [10, 20, 50, 100].map((v) => v * m);
  return { code, symbol, decimals, presets };
}

/** Live input formatting: keeps digits and one decimal point, groups thousands ("1234.5" → "1,234.5"). */
export function formatAmountInput(raw: string, decimals: number): string {
  let s = raw.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  const [rawInt, frac] = s.split(".") as [string, string | undefined];
  const int = rawInt.replace(/^0+(?=\d)/, "").slice(0, 9);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimals === 0 || frac === undefined) return grouped;
  return `${grouped || "0"}.${frac.slice(0, decimals)}`;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export function progressBar(part: number, whole: number, width = 10): string {
  const p = whole ? Math.min(1, part / whole) : 0;
  const filled = Math.round(p * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function randomDigits(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

export function slugCode(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase())
    .join("")
    .slice(0, 8);
  return (base || "SP") + randomDigits(2);
}
