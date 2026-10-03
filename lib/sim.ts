import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, like, lt } from "drizzle-orm";
import { getDb, schema } from "./db";

/**
 * Private simulator sessions.
 *
 * Every browser gets a random, HttpOnly session id. Test personas ("organiser", "amina", …)
 * map to phone numbers derived from that id on the server, so each visitor (each judge)
 * gets their own clean conversations and can't read or write anyone else's. The client
 * only ever names a persona, never a phone number.
 */
const COOKIE = "sp_sim";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const PERSONA = /^[a-z0-9-]{1,24}$/;

export function isPersona(p: unknown): p is string {
  return typeof p === "string" && PERSONA.test(p);
}

/** Deterministic test number for (session, persona): John is a UK number, everyone else Tanzanian. */
export function personaPhone(sid: string, persona: string): string {
  const h = createHash("sha256").update(`${sid}:${persona}`).digest("hex");
  const n = (parseInt(h.slice(0, 12), 16) % 100_000_000).toString().padStart(8, "0"); // 48 bits: exact in a double
  return persona === "john" ? `4477${n}` : `2557${n}`;
}

/** Current session id, or a fresh one (set as a cookie) when absent or when `rotate` is true. */
export async function simSession({ create = false, rotate = false } = {}): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing) && !rotate) return existing;
  if (!create && !rotate) return null;
  const sid = randomBytes(16).toString("hex");
  jar.set(COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return sid;
}

/** Client IP for coarse abuse limits (Render sits behind a proxy that sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

let lastSweep = 0;
/** At most once per hour: drop simulator chat history older than 14 days so test data can't pile up. */
export async function sweepOldSimChats(): Promise<void> {
  if (Date.now() - lastSweep < 60 * 60_000) return;
  lastSweep = Date.now();
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000);
    await db.delete(schema.chatLog).where(and(like(schema.chatLog.phone, "sim:%"), lt(schema.chatLog.createdAt, cutoff)));
  } catch (e) {
    console.error("[sim] sweep failed", e);
  }
}
