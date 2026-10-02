import "server-only";
import { paypalRest } from "./client";
import { env } from "../env";

/** Verifies a webhook with PayPal's verify-webhook-signature API. */
export async function verifyPaypalWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = env.paypalWebhookId();
  if (!webhookId) return false;
  const h = (n: string) => headers.get(n) ?? "";
  const res = await paypalRest<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}
