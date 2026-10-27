import "server-only";
import { ApiError } from "@paypal/paypal-server-sdk";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getOrderSummary } from "../paypal/orders";
import { applyCapture, refreshPayout, settleOrder } from "./core";

const { contributions, payouts, processedMessages, paymentEvents } = schema;

/**
 * Safety net run by the Render Cron Job (`sarafupay-reconcile`, every 15 minutes).
 *
 * Webhooks are the primary path, but they can be missed (deploy at the wrong moment,
 * PayPal retry exhaustion, a contributor closing the tab right after approving).
 * This job makes the ledger converge anyway:
 *
 * 1. Pending contributions with a PayPal order (10 min – 3 days old):
 *    - COMPLETED at PayPal  -> record it (receipt + organiser alert go out once).
 *    - APPROVED but never captured -> capture it, exactly what the return URL would do.
 * 2. Payouts stuck in "processing" -> pull the batch status and finalise.
 * 3. Prune WhatsApp de-duplication rows older than 7 days and PayPal event logs older than 90.
 *
 * Every step reuses the same idempotent functions as the webhooks, so a job that
 * overlaps a late webhook can never double-count money or double-notify.
 */
export type ReconcileReport = {
  checkedOrders: number;
  recoveredPayments: number;
  checkedPayouts: number;
  finalizedPayouts: number;
  prunedDedupRows: number;
  /** Orders PayPal no longer knows (expired before approval) or voided: closed as failed. */
  closedOrders: number;
  /** Real problems: the job run is marked failed so Render alerts us. */
  errors: string[];
  /** Temporary PayPal trouble on one order (5xx, 429, timeout): retried on the next run. */
  warnings: string[];
};

/** Turns any thrown value into a short, useful log line (SDK errors keep details off `message`). */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const r = e.result as { name?: string; message?: string; debug_id?: string } | undefined;
    const body = typeof e.body === "string" ? e.body.slice(0, 120) : "";
    return [`HTTP ${e.statusCode}`, r?.name, r?.message, r?.debug_id && `debug_id ${r.debug_id}`, !r && body]
      .filter(Boolean)
      .join(" · ");
  }
  if (e instanceof Error) return `${e.name}: ${e.message || "(no message)"}`;
  return String(e);
}

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
function isTransient(e: unknown): boolean {
  if (e instanceof ApiError) return TRANSIENT.has(e.statusCode);
  // axios transport failures (timeouts, resets) are not ApiError
  return e instanceof Error && /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(`${e.name} ${e.message}`);
}

const BATCH = 25;
const MIN_AGE_MS = 10 * 60_000;
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;

/** PayPal calls, injectable so the e2e test can run without the network. */
export type ReconcileDeps = {
  getOrder: typeof getOrderSummary;
  settle: typeof settleOrder;
};
const realDeps: ReconcileDeps = { getOrder: getOrderSummary, settle: settleOrder };

export async function reconcile(deps: ReconcileDeps = realDeps): Promise<ReconcileReport> {
  const db = await getDb();
  const now = Date.now();
  const report: ReconcileReport = {
    checkedOrders: 0,
    recoveredPayments: 0,
    checkedPayouts: 0,
    finalizedPayouts: 0,
    prunedDedupRows: 0,
    closedOrders: 0,
    errors: [],
    warnings: [],
  };

  // 1. Missed captures.
  const pending = await db
    .select({ id: contributions.id, orderId: contributions.paypalOrderId })
    .from(contributions)
    .where(
      and(
        eq(contributions.status, "pending"),
        isNotNull(contributions.paypalOrderId),
        lt(contributions.createdAt, new Date(now - MIN_AGE_MS)),
        gt(contributions.createdAt, new Date(now - MAX_AGE_MS)),
      ),
    )
    .limit(BATCH);

  for (const p of pending) {
    if (!p.orderId) continue;
    report.checkedOrders++;
    try {
      const order = await deps.getOrder(p.orderId);
      let settled;
      if (order.status === "VOIDED") {
        await closeContribution(p.id);
        report.closedOrders++;
        continue;
      }
      if (order.status === "COMPLETED") {
        settled = await applyCapture(p.orderId, order.status, order.captureId, order.customId ?? p.id, order.payerEmail);
      } else if (order.status === "APPROVED") {
        settled = await deps.settle(p.orderId);
      }
      if (settled?.status === "paid") report.recoveredPayments++;
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 404) {
        // Unapproved orders expire at PayPal; nothing was paid, so stop checking it.
        await closeContribution(p.id);
        report.closedOrders++;
      } else if (isTransient(e)) {
        report.warnings.push(`order ${p.orderId}: ${describeError(e)}`.slice(0, 240));
      } else {
        report.errors.push(`order ${p.orderId}: ${describeError(e)}`.slice(0, 240));
      }
    }
  }

  // 2. Payouts stuck in processing.
  const processing = await db
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.status, "processing"), isNotNull(payouts.paypalBatchId)))
    .limit(BATCH);

  for (const p of processing) {
    report.checkedPayouts++;
    try {
      const after = await refreshPayout(p.id);
      if (after && after.status !== "processing") report.finalizedPayouts++;
    } catch (e) {
      const line = `payout ${p.id}: ${describeError(e)}`.slice(0, 240);
      (isTransient(e) ? report.warnings : report.errors).push(line);
    }
  }

  // 3. De-duplication rows are only needed while Meta may still retry a delivery.
  const pruned = await db
    .delete(processedMessages)
    .where(lt(processedMessages.createdAt, new Date(now - 7 * 24 * 60 * 60_000)))
    .returning({ id: processedMessages.id });
  // The PayPal event log is the history the organiser copilot explains, so it stays longer.
  const prunedEvents = await db
    .delete(paymentEvents)
    .where(lt(paymentEvents.createdAt, new Date(now - 90 * 24 * 60 * 60_000)))
    .returning({ id: paymentEvents.id });
  report.prunedDedupRows = pruned.length + prunedEvents.length;

  return report;

  async function closeContribution(id: string) {
    // Only a still-pending row is closed, so a late webhook that already settled it wins.
    await db
      .update(contributions)
      .set({ status: "failed" })
      .where(and(eq(contributions.id, id), eq(contributions.status, "pending")));
  }
}
