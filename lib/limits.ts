import "server-only";
import { kvRun } from "./kv";

/**
 * Cost guard for the public demo (WhatsApp number + /chat simulator are open to anyone).
 *
 * - Per sender: at most PER_PHONE_MAX AI replies per PER_PHONE_WINDOW_MS (the dashboard
 *   passes a higher cap, since one Studio question fans out into several model calls).
 * - Global: at most DAILY_AI_LIMIT AI calls per UTC day (env-tunable), so a spammer
 *   or a loop cannot drain the Gemini prepaid credits.
 * Deterministic paths (CONFIRM/CANCEL payout codes) are never limited.
 *
 * Storage: Render Key Value when REDIS_URL is set, so counters survive deploys and
 * restarts and stay correct if the web service is ever scaled to several instances.
 * Without it (local dev, tests, or a Key Value hiccup) the same rules run in memory.
 */
const PER_PHONE_MAX = 15;
const PER_PHONE_WINDOW_MS = 10 * 60_000;
const DAY_TTL_S = 2 * 24 * 60 * 60;
const P = "sp:"; // key prefix
const dailyLimit = () => Number(process.env.DAILY_AI_LIMIT ?? 250) || 250;

export type LimitResult = { ok: true } | { ok: false; reason: "sender" | "daily"; notify: boolean };

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Key Value implementation (sliding windows in sorted sets) ----------

/** Hits for `key` inside the window (expired ones dropped). null = Key Value unavailable. */
async function kvWindowCount(key: string, windowMs: number, now: number) {
  return kvRun(async (c) => {
    const [, count] = await c.multi().zRemRangeByScore(key, 0, now - windowMs).zCard(key).exec();
    return Number(count);
  });
}

async function kvWindowAdd(key: string, windowMs: number, now: number) {
  return kvRun(async (c) => {
    await c
      .multi()
      .zAdd(key, { score: now, value: `${now}-${Math.random().toString(36).slice(2, 8)}` })
      .pExpire(key, windowMs)
      .exec();
    return true;
  });
}

/** Today's global AI call count. null = Key Value unavailable (a missing key is 0). */
async function kvDayCount(dayKey: string) {
  const r = await kvRun(async (c) => ({ v: await c.get(dayKey) }));
  return r === null ? null : Number(r.v ?? 0);
}

async function kvTakeAiCall(key: string, perWindowMax: number): Promise<LimitResult | null> {
  const now = Date.now();
  const senderKey = `${P}ai:sender:${key}`;
  const dayKey = `${P}ai:day:${today()}`;

  const recent = await kvWindowCount(senderKey, PER_PHONE_WINDOW_MS, now);
  const used = await kvDayCount(dayKey);
  if (recent === null || used === null) return null;

  let reason: "sender" | "daily" | null = null;
  if (recent >= perWindowMax) reason = "sender";
  else if (used >= dailyLimit()) reason = "daily";

  if (reason) {
    // Tell each sender at most once per window, so we never answer spam with spam.
    const set = await kvRun((c) => c.set(`${P}ai:notified:${key}`, "1", { NX: true, PX: PER_PHONE_WINDOW_MS }));
    if (reason === "daily") console.warn(`[limits] daily AI limit ${dailyLimit()} reached`);
    return { ok: false, reason, notify: set === "OK" };
  }

  const added = await kvWindowAdd(senderKey, PER_PHONE_WINDOW_MS, now);
  const counted = await kvRun((c) => c.multi().incr(dayKey).expire(dayKey, DAY_TTL_S).exec());
  if (added === null || counted === null) return null;
  return { ok: true };
}

// ---------- in-memory fallback ----------

const perPhone = new Map<string, number[]>();
const notified = new Map<string, number>();
let day = "";
let dayCount = 0;

function memTakeAiCall(key: string, perWindowMax: number): LimitResult {
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

const buckets = new Map<string, number[]>();
function memHit(key: string, max: number, windowMs: number): boolean {
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

// ---------- public API ----------

/** Reserve one AI call for `key` (a phone, or "studio:<code>"). */
export async function takeAiCall(key: string, perWindowMax = PER_PHONE_MAX): Promise<LimitResult> {
  return (await kvTakeAiCall(key, perWindowMax)) ?? memTakeAiCall(key, perWindowMax);
}

export async function aiUsageToday(): Promise<{ day: string; calls: number; limit: number; store: "keyvalue" | "memory" }> {
  const d = today();
  const fromKv = await kvDayCount(`${P}ai:day:${d}`);
  if (fromKv !== null) return { day: d, calls: fromKv, limit: dailyLimit(), store: "keyvalue" };
  return { day: d, calls: day === d ? dayCount : 0, limit: dailyLimit(), store: "memory" };
}

/**
 * Generic sliding-window counter for cheap abuse limits (e.g. simulator sends per IP).
 * Returns false once `key` has had `max` hits within `windowMs`.
 */
export async function hit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const k = `${P}hit:${key}`;
  const count = await kvWindowCount(k, windowMs, now);
  if (count !== null) {
    if (count >= max) return false;
    if ((await kvWindowAdd(k, windowMs, now)) !== null) return true;
  }
  return memHit(key, max, windowMs);
}
