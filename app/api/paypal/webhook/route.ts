import { after, NextResponse } from "next/server";
import { verifyPaypalWebhook } from "@/lib/paypal/webhooks";
import { applyCapture, refreshPayout, settleOrder, settlePledgeInvoice } from "@/lib/services/core";

type Event = { event_type: string; resource: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: Request) {
  const raw = await req.text();
  let ok = false;
  try {
    ok = await verifyPaypalWebhook(req.headers, raw);
  } catch (e) {
    console.error("[paypal webhook] verify error", e);
  }
  if (!ok) return new Response("unverified", { status: 401 });
  const evt = JSON.parse(raw) as Event;
  const r = evt.resource ?? {};
  after(async () => {
    try {
      switch (evt.event_type) {
        case "CHECKOUT.ORDER.APPROVED":
          await settleOrder(r.id);
          break;
        case "PAYMENT.CAPTURE.COMPLETED":
          await applyCapture(r.supplementary_data?.related_ids?.order_id, "COMPLETED", r.id, r.custom_id, undefined);
          break;
        case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
        case "PAYMENT.PAYOUTS-ITEM.FAILED":
        case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
        case "PAYMENT.PAYOUTS-ITEM.RETURNED":
        case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED":
        case "PAYMENT.PAYOUTSBATCH.SUCCESS":
          if (r.payout_item?.sender_item_id) await refreshPayout(r.payout_item.sender_item_id);
          else if (r.batch_header?.sender_batch_header?.sender_batch_id) await refreshPayout(r.batch_header.sender_batch_header.sender_batch_id);
          break;
        case "INVOICING.INVOICE.PAID":
          await settlePledgeInvoice(r.id ?? r.invoice?.id, r.detail?.invoice_number ?? r.invoice?.detail?.invoice_number);
          break;
      }
    } catch (e) {
      console.error("[paypal webhook] handler error", evt.event_type, e);
    }
  });
  return NextResponse.json({ ok: true });
}
