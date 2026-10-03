import "server-only";

/**
 * Cost guard for the public demo (WhatsApp number + /chat simulator are open to anyone).
 * In-memory is enough: the app runs as a single Render instance, and a restart only
 * resets the counters, never blocks anyone.
 *
 * - Per sender: at most PER_PHONE_MAX AI replies per PER_PHONE_WINDOW_MS (the dashboard
 *   passes a higher cap, since one Studio question fans out into several model calls).
 * - Global: at most DAILY_AI_LIMIT AI calls per UTC day (env-tunable), so a spammer
 *   or a loop cannot drain the Gemini prepaid credits.
 * Deterministic paths (CONFIRM/CANCEL payout codes) are never limited.
 */
const PER_PHONE_MAX = 15;
const PER_PHONE_WINDOW_MS = 10 * 60_000;
const dailyLimit = () => Number(process.env.DAILY_AI_LIMIT ?? 250) || 250;

const perPhone = new Map<string, number[]>();
const notified = new Map<string, number>();
let day = "";
let dayCount = 0;

export type LimitResult = { ok: true } | { ok: false; reason: "sender" | "daily"; notify: boolean };

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Reserve one AI call for `key` (a phone, or "studio:<code>"). */
export function takeAiCall(key: string, perWindowMax = PER_PHONE_MAX): LimitResult {
  const now = Date.now();
  if (day !== today()) {
    day = today();
    dayCount = 0;
  }
  const recent = (perPhone.get(key) ?? []).filter((t) => now - t < PER_PHONE_WINDOW_MS);
  let reason: "sender" | "daily" | null = null;
  if (recent.length >= perWindowMax) reason = "sender";
  else if (dayCount >= dailyLimit()) reason = "daily";

  if (reason) {
    perPhone.set(key, recent);
    // Tell each sender at most once per window, so we never answer spam with spam.
    const last = notified.get(key) ?? 0;
    const notify = now - last > PER_PHONE_WINDOW_MS;
    if (notify) notified.set(key, now);
    if (reason === "daily") console.warn(`[limits] daily AI limit ${dailyLimit()} reached`);
    return { ok: false, reason, notify };
  }
  recent.push(now);
  perPhone.set(key, recent);
  dayCount++;
  if (perPhone.size > 5000) perPhone.clear();
  return { ok: true };
}

export function aiUsageToday() {
  return { day, calls: dayCount, limit: dailyLimit() };
}

const buckets = new Map<string, number[]>();
/**
 * Generic sliding-window counter for cheap abuse limits (e.g. simulator sends per IP).
 * Returns false once `key` has had `max` hits within `windowMs`.
 */
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
