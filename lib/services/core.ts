import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Collection, Contribution, Payout, User } from "../db/schema";
import { money, newId, pct, progressBar, randomDigits, slugCode } from "../format";
import { sendTo } from "../channels/messaging";
import { captureOrder, createContributionOrder } from "../paypal/orders";
import { getPayoutBatch, sendPayout } from "../paypal/payouts";
import { dashboardUrl, payUrl } from "./links";
import { langOf, t, type Lang } from "../i18n";

const { users, collections, contributions, pledges, payouts } = schema;

// ---------- users ----------

export async function getOrCreateUser(phone: string, channel: "whatsapp" | "sim", profileName?: string): Promise<User> {
  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.phone, phone));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ id: newId("usr"), phone, channel, name: null })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(users).where(eq(users.phone, phone));
  void profileName;
  return again!;
}

export async function getUser(id: string): Promise<User | undefined> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function updateUser(id: string, patch: Partial<Pick<User, "name" | "paypalEmail" | "activeCollectionId">>) {
  const db = await getDb();
  const [u] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return u;
}

// ---------- collections ----------

export async function findCollection(code: string): Promise<Collection | undefined> {
  const db = await getDb();
  const [c] = await db
    .select()
    .from(collections)
    .where(eq(sql`upper(${collections.code})`, code.trim().toUpperCase()));
  return c;
}

export async function getCollectionById(id: string): Promise<Collection | undefined> {
  const db = await getDb();
  const [c] = await db.select().from(collections).where(eq(collections.id, id));
  return c;
}

export async function listOwnedCollections(ownerId: string): Promise<Collection[]> {
  const db = await getDb();
  return db.select().from(collections).where(eq(collections.ownerId, ownerId)).orderBy(desc(collections.createdAt));
}

export async function createCollection(input: {
  ownerId: string;
  title: string;
  purpose?: string;
  category?: string;
  targetCents: number;
  currency?: string;
  deadline?: string;
  payoutEmail?: string;
}): Promise<Collection> {
  const db = await getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [c] = await db
      .insert(collections)
      .values({
        id: newId("col"),
        code: slugCode(input.title),
        ownerId: input.ownerId,
        title: input.title.trim().slice(0, 120),
        purpose: input.purpose?.trim().slice(0, 500) || null,
        category: input.category ?? "other",
        targetCents: input.targetCents,
        currency: (input.currency ?? "USD").toUpperCase(),
        deadline: input.deadline || null,
        payoutEmail: input.payoutEmail || null,
        ownerKey: crypto.randomUUID().replace(/-/g, ""),
      })
      .onConflictDoNothing()
      .returning();
    if (c) return c;
  }
  throw new Error("Could not allocate a collection code");
}

export async function updateCollection(
  id: string,
  patch: Partial<Pick<Collection, "title" | "purpose" | "targetCents" | "deadline" | "payoutEmail" | "status">>,
) {
  const db = await getDb();
  const [c] = await db.update(collections).set(patch).where(eq(collections.id, id)).returning();
  return c;
}

export type CollectionStats = {
  raisedCents: number;
  paidCount: number;
  pendingCount: number;
  paidOutCents: number;
  inFlightCents: number;
  availableCents: number;
  openPledgeCents: number;
  openPledgeCount: number;
  percent: number;
};

export async function collectionStats(c: Collection): Promise<CollectionStats> {
  const db = await getDb();
  const [contrib] = await db
    .select({
      raised: sql<number>`coalesce(sum(case when ${contributions.status} = 'paid' then ${contributions.amountCents} else 0 end), 0)::int`,
      paid: sql<number>`count(*) filter (where ${contributions.status} = 'paid')::int`,
      pending: sql<number>`count(*) filter (where ${contributions.status} = 'pending')::int`,
    })
    .from(contributions)
    .where(eq(contributions.collectionId, c.id));
  const [po] = await db
    .select({
      done: sql<number>`coalesce(sum(case when ${payouts.status} = 'success' then ${payouts.amountCents} else 0 end), 0)::int`,
      flight: sql<number>`coalesce(sum(case when ${payouts.status} = 'processing' then ${payouts.amountCents} else 0 end), 0)::int`,
    })
    .from(payouts)
    .where(eq(payouts.collectionId, c.id));
  const [pl] = await db
    .select({
      cents: sql<number>`coalesce(sum(${pledges.amountCents}), 0)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(pledges)
    .where(and(eq(pledges.collectionId, c.id), eq(pledges.status, "open")));
  const raised = Number(contrib?.raised ?? 0);
  const paidOut = Number(po?.done ?? 0);
  const inFlight = Number(po?.flight ?? 0);
  return {
    raisedCents: raised,
    paidCount: Number(contrib?.paid ?? 0),
    pendingCount: Number(contrib?.pending ?? 0),
    paidOutCents: paidOut,
    inFlightCents: inFlight,
    availableCents: raised - paidOut - inFlight,
    openPledgeCents: Number(pl?.cents ?? 0),
    openPledgeCount: Number(pl?.n ?? 0),
    percent: pct(raised, c.targetCents),
  };
}

export function statusLine(c: Collection, s: CollectionStats, lang: Lang = "en"): string {
  const raised = money(s.raisedCents, c.currency);
  const target = money(c.targetCents, c.currency);
  return `${progressBar(s.raisedCents, c.targetCents)} ${s.percent}% · ${t(
    lang,
    `${raised} kati ya ${target} kutoka kwa wachangiaji ${s.paidCount}`,
    `${raised} of ${target} from ${s.paidCount} contributor${s.paidCount === 1 ? "" : "s"}`,
  )}`;
}

export async function listContributions(collectionId: string, status?: string) {
  const db = await getDb();
  return db
    .select()
    .from(contributions)
    .where(status ? and(eq(contributions.collectionId, collectionId), eq(contributions.status, status)) : eq(contributions.collectionId, collectionId))
    .orderBy(desc(contributions.createdAt));
}

export async function listPledges(collectionId: string) {
  const db = await getDb();
  return db.select().from(pledges).where(eq(pledges.collectionId, collectionId)).orderBy(asc(pledges.createdAt));
}

export async function listPayouts(collectionId: string) {
  const db = await getDb();
  return db.select().from(payouts).where(eq(payouts.collectionId, collectionId)).orderBy(desc(payouts.createdAt));
}

// ---------- contributions ----------

export async function createContribution(input: {
  collection: Collection;
  contributorId?: string | null;
  displayName: string;
  amountCents: number;
  source: "whatsapp" | "sim" | "web";
  message?: string;
}): Promise<Contribution> {
  if (input.collection.status !== "active") throw new Error("This collection is closed");
  if (input.amountCents < 100) throw new Error("Minimum contribution is 1.00");
  if (input.amountCents > 1_000_000) throw new Error("Maximum single contribution is 10,000.00");
  const db = await getDb();
  const [row] = await db
    .insert(contributions)
    .values({
      id: newId("ctb"),
      collectionId: input.collection.id,
      contributorId: input.contributorId ?? null,
      displayName: input.displayName.trim().slice(0, 80) || "Anonymous",
      amountCents: input.amountCents,
      currency: input.collection.currency,
      source: input.source,
      message: input.message?.slice(0, 280) || null,
    })
    .returning();
  return row!;
}

export async function getContribution(id: string) {
  const db = await getDb();
  const [c] = await db.select().from(contributions).where(eq(contributions.id, id));
  return c;
}

/** Creates (once) the PayPal order for a contribution and returns the approval URL. */
export async function startCheckout(contributionId: string): Promise<string> {
  const db = await getDb();
  const ctb = await getContribution(contributionId);
  if (!ctb) throw new Error("Unknown payment link");
  if (ctb.status !== "pending") throw new Error("This payment link has already been used");
  const col = await getCollectionById(ctb.collectionId);
  if (!col || col.status !== "active") throw new Error("This collection is closed");
  const order = await createContributionOrder({
    contributionId: ctb.id,
    amountCents: ctb.amountCents,
    currency: ctb.currency,
    collectionTitle: col.title,
    collectionCode: col.code,
  });
  await db.update(contributions).set({ paypalOrderId: order.orderId }).where(eq(contributions.id, ctb.id));
  return order.approveUrl;
}

/** Captures an approved order and settles the matching contribution. Idempotent. */
export async function settleOrder(orderId: string): Promise<Contribution | undefined> {
  const result = await captureOrder(orderId);
  return applyCapture(orderId, result.status, result.captureId, result.customId, result.payerEmail);
}

export async function applyCapture(
  orderId: string | undefined,
  status: string,
  captureId?: string,
  customId?: string,
  payerEmail?: string,
): Promise<Contribution | undefined> {
  const db = await getDb();
  const key = customId
    ? eq(contributions.id, customId)
    : orderId
      ? eq(contributions.paypalOrderId, orderId)
      : undefined;
  if (!key) return undefined;
  if (status !== "COMPLETED") {
    const [c] = await db.select().from(contributions).where(key);
    return c;
  }
  const [updated] = await db
    .update(contributions)
    .set({ status: "paid", paidAt: new Date(), paypalCaptureId: captureId ?? null, payerEmail: payerEmail ?? null, ...(orderId ? { paypalOrderId: orderId } : {}) })
    .where(and(key, eq(contributions.status, "pending")))
    .returning();
  if (updated) await onContributionPaid(updated); // only the first settle notifies
  const [c] = await db.select().from(contributions).where(key);
  return c;
}

async function onContributionPaid(ctb: Contribution) {
  const col = await getCollectionById(ctb.collectionId);
  if (!col) return;
  const db = await getDb();
  // Fulfil this person's open pledges.
  if (ctb.contributorId) {
    await db
      .update(pledges)
      .set({ status: "fulfilled" })
      .where(and(eq(pledges.collectionId, col.id), eq(pledges.userId, ctb.contributorId), eq(pledges.status, "open")));
  }
  const stats = await collectionStats(col);
  const owner = await getUser(col.ownerId);
  const amount = money(ctb.amountCents, ctb.currency);
  if (ctb.contributorId) {
    const contributor = await getUser(ctb.contributorId);
    if (contributor) {
      const L = await langOf(contributor.phone);
      const ref = ctb.paypalCaptureId ?? ctb.paypalOrderId;
      await sendTo(
        contributor.phone,
        t(
          L,
          `✅ *Malipo yamepokelewa* — asante, ${ctb.displayName}!\n${amount} kwa *${col.title}* (${col.code}).\nKumbukumbu ya PayPal: ${ref}\n\n${statusLine(col, stats, L)}`,
          `✅ *Payment received* — thank you, ${ctb.displayName}!\n${amount} to *${col.title}* (${col.code}).\nPayPal ref: ${ref}\n\n${statusLine(col, stats, L)}`,
        ),
      );
    }
  }
  if (owner && owner.id !== ctb.contributorId) {
    const L = await langOf(owner.phone);
    const note = ctb.message ? `\n“${ctb.message}”` : "";
    await sendTo(
      owner.phone,
      t(
        L,
        `💰 *${ctb.displayName}* amechangia ${amount} kwa *${col.code}*${note}\n${statusLine(col, stats, L)}`,
        `💰 *${ctb.displayName}* contributed ${amount} to *${col.code}*${note}\n${statusLine(col, stats, L)}`,
      ),
    );
  }
  if (owner && stats.raisedCents >= col.targetCents && stats.raisedCents - ctb.amountCents < col.targetCents) {
    const L = await langOf(owner.phone);
    const target = money(col.targetCents, col.currency);
    await sendTo(owner.phone, t(L, `🎉 *${col.title}* imefikia lengo lake la ${target}!`, `🎉 *${col.title}* just reached its target of ${target}!`));
  }
}

// ---------- pledges ----------

export async function createPledge(input: {
  collection: Collection;
  user: User;
  displayName: string;
  amountCents: number;
  dueDate?: string;
}) {
  const db = await getDb();
  const [p] = await db
    .insert(pledges)
    .values({
      id: newId("plg"),
      collectionId: input.collection.id,
      userId: input.user.id,
      displayName: input.displayName,
      amountCents: input.amountCents,
      dueDate: input.dueDate || null,
    })
    .returning();
  const owner = await getUser(input.collection.ownerId);
  if (owner && owner.id !== input.user.id) {
    const L = await langOf(owner.phone);
    const amt = money(input.amountCents, input.collection.currency);
    const due = input.dueDate ? t(L, ` (kufikia ${input.dueDate})`, ` (by ${input.dueDate})`) : "";
    await sendTo(
      owner.phone,
      t(L, `🤞 *${input.displayName}* ameahidi ${amt} kwa *${input.collection.code}*${due}.`, `🤞 *${input.displayName}* pledged ${amt} to *${input.collection.code}*${due}.`),
    );
  }
  return p!;
}

/**
 * Sends a personal WhatsApp reminder with a fresh pay link to each open pledger.
 * A pledge is marked reminded only when WhatsApp accepted the message; pledgers we
 * could not reach (usually: no message from them in 24h, so Meta refuses free text)
 * come back in `unreachable` with their pay link, for the organiser to forward.
 * Sends are spaced ~1s apart to stay inside per-number throughput limits.
 */
export async function remindPledgers(col: Collection): Promise<{
  reminded: string[];
  skipped: string[];
  unreachable: { name: string; reason: string; pay_link: string }[];
}> {
  const db = await getDb();
  const open = await db
    .select()
    .from(pledges)
    .where(and(eq(pledges.collectionId, col.id), eq(pledges.status, "open")));
  const reminded: string[] = [];
  const skipped: string[] = [];
  const unreachable: { name: string; reason: string; pay_link: string }[] = [];
  let sentToWhatsApp = 0;
  for (const p of open) {
    const u = p.userId ? await getUser(p.userId) : undefined;
    if (!u) {
      skipped.push(p.displayName);
      continue;
    }
    const ctb = await createContribution({
      collection: col,
      contributorId: u.id,
      displayName: p.displayName,
      amountCents: p.amountCents,
      source: u.channel === "sim" ? "sim" : "whatsapp",
    });
    const L = await langOf(u.phone);
    const amt = money(p.amountCents, col.currency);
    if (u.channel !== "sim" && sentToWhatsApp++ > 0) await new Promise((r) => setTimeout(r, 1100));
    const sent = await sendTo(
      u.phone,
      t(
        L,
        `👋 Habari ${p.displayName}, kumbusho la kirafiki kuhusu ahadi yako ya ${amt} kwa *${col.title}*${p.dueDate ? ` (tarehe ${p.dueDate})` : ""}.\nLipa kwa usalama kupitia PayPal: ${payUrl(ctb.id)}`,
        `👋 Hi ${p.displayName}, a friendly reminder about your pledge of ${amt} to *${col.title}*${p.dueDate ? ` (due ${p.dueDate})` : ""}.\nPay securely with PayPal: ${payUrl(ctb.id)}`,
      ),
    );
    if (sent.ok) {
      await db.update(pledges).set({ remindedAt: new Date() }).where(eq(pledges.id, p.id));
      reminded.push(p.displayName);
    } else {
      unreachable.push({
        name: p.displayName,
        reason: sent.reason === "outside_24h" ? "has not messaged SarafuPay in the last 24 hours (WhatsApp rule)" : "WhatsApp did not accept the message",
        pay_link: payUrl(ctb.id),
      });
    }
  }
  return { reminded, skipped, unreachable };
}

// ---------- payouts ----------

export async function proposePayout(input: {
  collection: Collection;
  requester: User;
  recipientEmail: string;
  recipientName?: string;
  amountCents: number;
  note?: string;
}): Promise<Payout> {
  const col = input.collection;
  if (col.ownerId !== input.requester.id) throw new Error("Only the collection owner can request payouts");
  const stats = await collectionStats(col);
  if (input.amountCents > stats.availableCents) {
    throw new Error(`Insufficient balance: available ${money(stats.availableCents, col.currency)}`);
  }
  const db = await getDb();
  // Only one pending confirmation per collection at a time.
  await db
    .update(payouts)
    .set({ status: "cancelled" })
    .where(and(eq(payouts.collectionId, col.id), eq(payouts.status, "awaiting_confirmation")));
  const [p] = await db
    .insert(payouts)
    .values({
      id: newId("pay"),
      collectionId: col.id,
      requestedBy: input.requester.id,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      recipientName: input.recipientName?.trim() || null,
      amountCents: input.amountCents,
      currency: col.currency,
      note: input.note?.trim().slice(0, 300) || null,
      confirmCode: randomDigits(6),
    })
    .returning();
  return p!;
}

/**
 * Executes a payout ONLY when the owner's own phone sends "CONFIRM <code>".
 * This path never goes through the LLM.
 */
export async function confirmPayoutByCode(user: User, code: string): Promise<string> {
  const db = await getDb();
  const L = await langOf(user.phone);
  const owned = await listOwnedCollections(user.id);
  if (!owned.length) return t(L, "Huna mchango wowote, kwa hiyo hakuna cha kuthibitisha.", "You don't have any collections, so there is nothing to confirm.");
  const [p] = await db
    .select()
    .from(payouts)
    .where(
      and(
        inArray(payouts.collectionId, owned.map((c) => c.id)),
        eq(payouts.confirmCode, code),
        eq(payouts.status, "awaiting_confirmation"),
      ),
    );
  if (!p) return t(L, "❌ Msimbo huo haulingani na malipo yoyote yanayosubiri. Niombe niandae malipo upya.", "❌ That confirmation code doesn't match any pending payout. Ask me to prepare the payout again.");
  if (Date.now() - new Date(p.createdAt).getTime() > 15 * 60_000) {
    await db.update(payouts).set({ status: "cancelled" }).where(eq(payouts.id, p.id));
    return t(L, "⌛ Ombi hilo la malipo limeisha muda (dakika 15). Niombe niliandae tena.", "⌛ That payout request expired (15 minutes). Ask me to prepare it again.");
  }
  const col = owned.find((c) => c.id === p.collectionId)!;
  const stats = await collectionStats(col);
  if (p.amountCents > stats.availableCents) {
    await db.update(payouts).set({ status: "cancelled" }).where(eq(payouts.id, p.id));
    return t(L, `❌ Salio limebadilika — sasa kuna ${money(stats.availableCents, col.currency)} tu.`, `❌ Balance changed — only ${money(stats.availableCents, col.currency)} is available now.`);
  }
  const [locked] = await db
    .update(payouts)
    .set({ status: "processing", executedAt: new Date() })
    .where(and(eq(payouts.id, p.id), eq(payouts.status, "awaiting_confirmation")))
    .returning();
  if (!locked) return t(L, "Malipo haya tayari yanashughulikiwa.", "This payout is already being processed.");
  try {
    const res = await sendPayout({
      payoutId: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      recipientEmail: p.recipientEmail,
      subject: `Payment from "${col.title}" via SarafuPay`,
      note: p.note ?? `Payout from ${col.title} (${col.code})`,
    });
    await db.update(payouts).set({ paypalBatchId: res.batchId }).where(eq(payouts.id, p.id));
    schedulePayoutRefresh(p.id);
    const amt = money(p.amountCents, p.currency);
    const who = p.recipientName ?? p.recipientEmail;
    return t(
      L,
      `🚀 Malipo yametumwa PayPal: ${amt} → ${who}.\nBatch ${res.batchId} (${res.batchStatus}). Nitathibitisha yakikamilika na kutuma taarifa ya uwazi kwa wachangiaji.`,
      `🚀 Payout sent to PayPal: ${amt} → ${who}.\nBatch ${res.batchId} (${res.batchStatus}). I'll confirm when it completes and post a transparency update to contributors.`,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db.update(payouts).set({ status: "failed", failureReason: reason.slice(0, 500) }).where(eq(payouts.id, p.id));
    return t(L, `❌ PayPal imekataa malipo: ${reason.slice(0, 200)}`, `❌ PayPal rejected the payout: ${reason.slice(0, 200)}`);
  }
}

export async function cancelPayoutByCode(user: User, code: string): Promise<string> {
  const db = await getDb();
  const L = await langOf(user.phone);
  const owned = await listOwnedCollections(user.id);
  if (!owned.length) return t(L, "Hakuna cha kughairi.", "Nothing to cancel.");
  const rows = await db
    .update(payouts)
    .set({ status: "cancelled" })
    .where(
      and(
        inArray(payouts.collectionId, owned.map((c) => c.id)),
        eq(payouts.confirmCode, code),
        eq(payouts.status, "awaiting_confirmation"),
      ),
    )
    .returning();
  return rows.length
    ? t(L, "👍 Malipo yameghairiwa. Hakuna pesa iliyohamishwa.", "👍 Payout cancelled. No money moved.")
    : t(L, "Hakuna malipo yanayosubiri yenye msimbo huo.", "No pending payout with that code.");
}

function schedulePayoutRefresh(payoutId: string) {
  for (const delay of [8_000, 30_000, 120_000]) {
    setTimeout(() => void refreshPayout(payoutId).catch((e) => console.error("[payout refresh]", e)), delay);
  }
}

const FINAL_OK = new Set(["SUCCESS"]);
const FINAL_BAD = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED"]);

/** Pulls payout status from PayPal and finalises it (also called from webhooks). */
export async function refreshPayout(payoutId: string): Promise<Payout | undefined> {
  const db = await getDb();
  const [p] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p || p.status !== "processing" || !p.paypalBatchId) return p;
  const state = await getPayoutBatch(p.paypalBatchId);
  const s = (state.itemStatus ?? "").toUpperCase();
  if (FINAL_OK.has(s)) return finalizePayout(p, "success", state.itemId);
  if (FINAL_BAD.has(s)) return finalizePayout(p, "failed", state.itemId, state.error ?? s);
  // UNCLAIMED: in sandbox this happens when the email has no account — funds are held, treat as failed for clarity.
  if (s === "UNCLAIMED") return finalizePayout(p, "failed", state.itemId, "Recipient email has no PayPal account (unclaimed)");
  return p;
}

export async function finalizePayout(p: Payout, status: "success" | "failed", itemId?: string, reason?: string) {
  const db = await getDb();
  const [done] = await db
    .update(payouts)
    .set({ status, paypalItemId: itemId ?? p.paypalItemId, failureReason: reason?.slice(0, 500) ?? null })
    .where(and(eq(payouts.id, p.id), eq(payouts.status, "processing")))
    .returning();
  if (!done) return p;
  const col = await getCollectionById(p.collectionId);
  const owner = col ? await getUser(col.ownerId) : undefined;
  if (!col) return done;
  if (status === "failed") {
    if (owner) {
      const L = await langOf(owner.phone);
      const amt = money(p.amountCents, p.currency);
      await sendTo(
        owner.phone,
        t(L, `⚠️ Malipo ya ${amt} kwenda ${p.recipientEmail} yameshindwa: ${reason}. Pesa imerudi kwenye salio la mchango.`, `⚠️ Payout of ${amt} to ${p.recipientEmail} failed: ${reason}. The money is back in the collection balance.`),
      );
    }
    return done;
  }
  const stats = await collectionStats(col);
  const amt = money(p.amountCents, p.currency);
  const who = p.recipientName ?? p.recipientEmail;
  const raised = money(stats.raisedCents, col.currency);
  const paid = money(stats.paidOutCents, col.currency);
  const bal = money(stats.availableCents, col.currency);
  const ref = done.paypalItemId ?? done.paypalBatchId;
  const update = (L: Lang) =>
    t(
      L,
      `🧾 *Taarifa ya uwazi — ${col.title}*\n${amt} imelipwa kwa *${who}*${p.note ? ` kwa ajili ya ${p.note}` : ""}.\nZilizochangwa ${raised} · Zilizolipwa ${paid} · Salio ${bal}\nKumbukumbu ya PayPal: ${ref}`,
      `🧾 *Transparency update — ${col.title}*\n${amt} was paid to *${who}*${p.note ? ` for ${p.note}` : ""}.\nRaised ${raised} · Paid out ${paid} · Balance ${bal}\nPayPal payout ref: ${ref}`,
    );
  if (owner) await sendTo(owner.phone, update(await langOf(owner.phone)));
  // Broadcast to every distinct contributor reachable in chat.
  const contributorIds = await db
    .selectDistinct({ id: contributions.contributorId })
    .from(contributions)
    .where(and(eq(contributions.collectionId, col.id), eq(contributions.status, "paid")));
  for (const { id } of contributorIds) {
    if (!id || id === owner?.id) continue;
    const u = await getUser(id);
    if (u) await sendTo(u.phone, update(await langOf(u.phone)));
  }
  return done;
}

export { dashboardUrl };

/** PayPal invoice for a pledge was paid (webhook): record it as a contribution. */
export async function settlePledgeInvoice(invoiceId: string, invoiceNumber?: string): Promise<void> {
  const db = await getDb();
  const [p] = await db.select().from(pledges).where(eq(pledges.invoiceId, invoiceId));
  if (!p || p.status !== "open") return;
  const [claimed] = await db
    .update(pledges)
    .set({ status: "fulfilled" })
    .where(and(eq(pledges.id, p.id), eq(pledges.status, "open")))
    .returning();
  if (!claimed) return;
  const col = await getCollectionById(p.collectionId);
  if (!col) return;
  const [ctb] = await db
    .insert(contributions)
    .values({
      id: newId("ctb"),
      collectionId: col.id,
      contributorId: p.userId,
      displayName: p.displayName,
      amountCents: p.amountCents,
      currency: col.currency,
      source: "web",
      message: `Paid PayPal invoice ${invoiceNumber ?? invoiceId}`,
      status: "paid",
      paidAt: new Date(),
      paypalOrderId: invoiceId,
    })
    .returning();
  if (ctb) await onContributionPaid(ctb);
}
