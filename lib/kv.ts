import "server-only";
import type { RedisClientType } from "redis";

/**
 * Optional Render Key Value (Redis-compatible) connection.
 *
 * On Render, REDIS_URL comes from the `sarafupay-kv` Key Value instance over the
 * private network (see render.yaml). Locally and in tests it is unset, and callers
 * fall back to in-memory state, so the app still runs with zero setup.
 *
 * A Key Value outage must never take WhatsApp replies down with it: every call
 * here is bounded by a short timeout and returns null on failure.
 */
type Holder = { client?: Promise<RedisClientType | null>; downUntil?: number };
const g = globalThis as unknown as { __sarafuKv?: Holder };
const holder: Holder = (g.__sarafuKv ??= {});

const OP_TIMEOUT_MS = 800;
const RETRY_AFTER_MS = 30_000;

async function connect(url: string): Promise<RedisClientType | null> {
  try {
    const { createClient } = await import("redis");
    const client = createClient({
      url,
      socket: { connectTimeout: 1_500, reconnectStrategy: (n) => (n > 1 ? false : 200) },
    }) as RedisClientType;
    client.on("error", (e) => console.warn("[kv] error:", e instanceof Error ? e.message : e));
    await client.connect();
    console.log("[kv] connected to Render Key Value");
    return client;
  } catch (e) {
    console.warn("[kv] unavailable, using in-memory fallback:", e instanceof Error ? e.message : e);
    holder.downUntil = Date.now() + RETRY_AFTER_MS;
    return null;
  }
}

/** Returns a connected client, or null when Key Value is not configured or unreachable. */
export async function kv(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (holder.downUntil && Date.now() < holder.downUntil) return null;
  if (holder.downUntil) {
    holder.downUntil = undefined;
    holder.client = undefined;
  }
  holder.client ??= connect(url);
  const client = await holder.client;
  if (!client) {
    holder.client = undefined;
    return null;
  }
  if (client.isReady) return client;
  if (!client.isOpen) {
    // The connection was lost and the client gave up: back off, then reconnect.
    holder.client = undefined;
    holder.downUntil = Date.now() + RETRY_AFTER_MS;
  }
  return null;
}

/** Runs one Key Value operation with a timeout. Returns null on any failure. */
export async function kvRun<T>(op: (c: RedisClientType) => Promise<T>): Promise<T | null> {
  const client = await kv();
  if (!client) return null;
  try {
    return await Promise.race([
      op(client),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("kv timeout")), OP_TIMEOUT_MS)),
    ]);
  } catch (e) {
    console.warn("[kv] op failed, using in-memory fallback:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function kvConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}
