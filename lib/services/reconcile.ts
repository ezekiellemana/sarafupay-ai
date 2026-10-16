import "server-only";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getOrderSummary } from "../paypal/orders";
import { applyCapture, refreshPayout, settleOrder } from "./core";

const { contributions, payouts, processedMessages } = schema;

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
 * 3. Prune WhatsApp de-duplication rows older than 7 days.
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
  errors: string[];
};

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
    errors: [],
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
      if (order.status === "COMPLETED") {
        settled = await applyCapture(p.orderId, order.status, order.captureId, order.customId ?? p.id, order.payerEmail);
      } else if (order.status === "APPROVED") {
        settled = await deps.settle(p.orderId);
      }
      if (settled?.status === "paid") report.recoveredPayments++;
    } catch (e) {
      report.errors.push(`order ${p.orderId}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
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
      report.errors.push(`payout ${p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
    }
  }

  // 3. De-duplication rows are only needed while Meta may still retry a delivery.
  const pruned = await db
    .delete(processedMessages)
    .where(lt(processedMessages.createdAt, new Date(now - 7 * 24 * 60 * 60_000)))
    .returning({ id: processedMessages.id });
  report.prunedDedupRows = pruned.length;

  return report;
}
