import "server-only";
import { paypalRest } from "./client";
import { centsToValue } from "../format";

type BatchResponse = {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: { payout_item_id: string; transaction_status?: string; errors?: { name?: string; message?: string } }[];
};

/** PayPal Payouts v1 (not covered by the server SDK or the Agent Toolkit, so plain REST). */
export async function sendPayout(input: {
  payoutId: string;
  amountCents: number;
  currency: string;
  recipientEmail: string;
  note: string;
  subject: string;
}): Promise<{ batchId: string; batchStatus: string }> {
  const res = await paypalRest<BatchResponse>("/v1/payments/payouts", {
    method: "POST",
    requestId: input.payoutId,
    body: {
      sender_batch_header: {
        sender_batch_id: input.payoutId,
        email_subject: input.subject.slice(0, 255),
        email_message: input.note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.recipientEmail,
          amount: { value: centsToValue(input.amountCents), currency: input.currency },
          note: input.note.slice(0, 4000),
          sender_item_id: input.payoutId,
        },
      ],
    },
  });
  return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status };
}

export type PayoutItemState = { itemId?: string; itemStatus?: string; batchStatus: string; error?: string };

export async function getPayoutBatch(batchId: string): Promise<PayoutItemState> {
  const res = await paypalRest<BatchResponse>(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  const item = res.items?.[0];
  return {
    itemId: item?.payout_item_id,
    itemStatus: item?.transaction_status,
    batchStatus: res.batch_header.batch_status,
    error: item?.errors?.message ?? item?.errors?.name,
  };
}
