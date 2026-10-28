import "server-only";
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { EvidenceCard } from "../db/schema";
import { env } from "../env";
import { newId } from "../format";

/**
 * Evidence cards: a signed record of every money movement in a collection.
 *
 * Each PayPal capture and each payout appends a card saying who paid or was paid, how much, the
 * PayPal references, who authorised it and the collection's totals right after. Cards are chained
 * per collection (each body carries the previous card's hash) and signed with Ed25519, so editing
 * or deleting a card is detectable by anyone holding the public key, including in their own browser
 * on /proof/<id>.
 */

export type EvidenceEvent = "payment_received" | "payout_sent" | "payout_failed";

export type EvidenceBody = {
  v: 1;
  id: string;
  seq: number;
  prev: string | null;
  at: string;
  collection: { id: string; code: string };
  record: string;
  event: EvidenceEvent;
  amount_cents: number;
  currency: string;
  /** Contributor's first name, or the payout recipient's name. Never an email. */
  party: string;
  purpose: string | null;
  paypal: { order_id?: string | null; capture_id?: string | null; batch_id?: string | null; item_id?: string | null };
  authorised_by: "payer_via_paypal" | "organiser_confirm_code";
  /** The collection right after this event. */
  totals: { raised_cents: number; paid_out_cents: number; balance_cents: number };
  failure: string | null;
};

const DEV_SEED = createHash("sha256").update("sarafupay-dev-evidence-key").digest();

let cached: { priv: KeyObject; pub: KeyObject; publicKey: string; dev: boolean } | null = null;
/** The signing key: EVIDENCE_SIGNING_KEY (32-byte seed, base64) or a fixed development key. */
export function signingKey() {
  const configured = env.evidenceSigningKey();
  if (cached && cached.dev === !configured) return cached;
  const seed = configured ? Buffer.from(configured, "base64") : DEV_SEED;
  if (seed.length !== 32) throw new Error("EVIDENCE_SIGNING_KEY must be 32 bytes, base64-encoded");
  // PKCS#8 wrapper for a raw Ed25519 seed.
  const priv = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  const raw = pub.export({ format: "der", type: "spki" }).subarray(-32);
  cached = { priv, pub, publicKey: Buffer.from(raw).toString("base64url"), dev: !configured };
  return cached;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Appends a card to the collection's chain. Retries when two cards race for the same position. */
export async function appendCard(input: Omit<EvidenceBody, "v" | "id" | "seq" | "prev" | "at">): Promise<EvidenceCard> {
  const db = await getDb();
  const key = signingKey();
  for (let attempt = 0; ; attempt++) {
    const [last] = await db
      .select({ seq: schema.evidenceCards.seq, hash: schema.evidenceCards.hash })
      .from(schema.evidenceCards)
      .where(eq(schema.evidenceCards.collectionId, input.collection.id))
      .orderBy(desc(schema.evidenceCards.seq))
      .limit(1);
    const body: EvidenceBody = { v: 1, id: newId("ev"), seq: (last?.seq ?? 0) + 1, prev: last?.hash ?? null, at: new Date().toISOString(), ...input };
    const text = JSON.stringify(body);
    const hash = sha256(text);
    const sig = sign(null, Buffer.from(hash, "hex"), key.priv).toString("base64url");
    try {
      const [card] = await db
        .insert(schema.evidenceCards)
        .values({ id: body.id, collectionId: input.collection.id, recordId: input.record, seq: body.seq, body: text, hash, sig })
        .returning();
      return card!;
    } catch (e) {
      if (attempt < 3 && /evidence_chain_idx|unique|duplicate/i.test(String(e))) continue;
      throw e;
    }
  }
}

export type CardCheck = { hashOk: boolean; sigOk: boolean; linkOk: boolean };

/** Checks one card: its hash matches its body, the signature is valid, and it points at the card before it. */
export function checkCard(card: EvidenceCard, previous: EvidenceCard | undefined): CardCheck {
  let body: EvidenceBody | null = null;
  try {
    body = JSON.parse(card.body) as EvidenceBody;
  } catch {
    body = null;
  }
  const hashOk = sha256(card.body) === card.hash;
  let sigOk = false;
  try {
    sigOk = verify(null, Buffer.from(card.hash, "hex"), signingKey().pub, Buffer.from(card.sig, "base64url"));
  } catch {
    sigOk = false;
  }
  const linkOk = !!body && (card.seq === 1 ? body.prev === null : previous !== undefined && previous.seq === card.seq - 1 && body.prev === previous.hash);
  return { hashOk, sigOk, linkOk: linkOk && body?.seq === card.seq };
}

export async function getCard(id: string) {
  if (!/^ev_[a-f0-9]{16}$/.test(id)) return null;
  const db = await getDb();
  const [card] = await db.select().from(schema.evidenceCards).where(eq(schema.evidenceCards.id, id));
  return card ?? null;
}

export async function chainFor(collectionId: string) {
  const db = await getDb();
  return db.select().from(schema.evidenceCards).where(eq(schema.evidenceCards.collectionId, collectionId)).orderBy(asc(schema.evidenceCards.seq));
}

/** First card (by position) that is altered, unsigned, unlinked or missing; undefined when the chain is intact. */
export function firstBroken(cards: EvidenceCard[]): number | undefined {
  for (const [i, card] of cards.entries()) {
    const c = checkCard(card, cards[i - 1]);
    if (card.seq !== i + 1 || !c.hashOk || !c.sigOk || !c.linkOk) return card.seq;
  }
  return undefined;
}

/** Verifies a whole collection's chain: every card intact, signed and linked, with no gaps. */
export async function verifyChain(collectionId: string): Promise<{ ok: boolean; length: number; brokenAt: number | null }> {
  const cards = await chainFor(collectionId);
  const brokenAt = firstBroken(cards);
  return { ok: brokenAt === undefined, length: cards.length, brokenAt: brokenAt ?? null };
}

export const proofUrl = (id: string) => `${env.appUrl()}/proof/${id}`;

/** Every card about one contribution or payout, oldest first. */
export async function cardsForRecord(recordId: string) {
  const db = await getDb();
  return db.select().from(schema.evidenceCards).where(eq(schema.evidenceCards.recordId, recordId)).orderBy(asc(schema.evidenceCards.seq));
}
