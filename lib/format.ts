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
