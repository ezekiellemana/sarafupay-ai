import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, whatsappConfigured } from "../env";

const graph = () => `https://graph.facebook.com/${env.waGraphVersion()}`;

export type SendResult = { ok: true } | { ok: false; reason: "outside_24h" | "not_configured" | "error"; detail?: string };

/**
 * Sends a text and reports whether Meta accepted it. Callers that record state
 * (e.g. "reminded") must check `ok` — a failed send is not a sent message.
 * Error 131047 = more than 24h since the user last messaged us; free-form text is
 * refused until they write again (only approved templates can be sent).
 */
export async function sendWhatsAppText(toDigits: string, body: string): Promise<SendResult> {
  if (!whatsappConfigured()) {
    console.warn("[whatsapp] not configured; message not sent to", toDigits);
    return { ok: false, reason: "not_configured" };
  }
  // WhatsApp caps text bodies at 4096 chars.
  for (let i = 0; i < body.length; i += 4000) {
    const res = await fetch(`${graph()}/${env.waPhoneNumberId()}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.waToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "text",
        text: { preview_url: true, body: body.slice(i, i + 4000) },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[whatsapp] send failed", res.status, detail);
      return { ok: false, reason: /131047|re-engagement/i.test(detail) ? "outside_24h" : "error", detail: detail.slice(0, 300) };
    }
  }
  return { ok: true };
}

export async function markRead(messageId: string): Promise<void> {
  if (!whatsappConfigured()) return;
  await fetch(`${graph()}/${env.waPhoneNumberId()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.waToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
  }).catch(() => {});
}

/** Downloads inbound media (voice notes) so the model can listen to them. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ data: Uint8Array; mimeType: string }> {
  const meta = await fetch(`${graph()}/${mediaId}`, { headers: { Authorization: `Bearer ${env.waToken()}` } });
  if (!meta.ok) throw new Error(`media lookup failed ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: { Authorization: `Bearer ${env.waToken()}` } });
  if (!file.ok) throw new Error(`media download failed ${file.status}`);
  return { data: new Uint8Array(await file.arrayBuffer()), mimeType: mime_type.split(";")[0] };
}

/** Validates Meta's X-Hub-Signature-256 header against the app secret. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = env.waAppSecret();
  if (!secret) return process.env.NODE_ENV !== "production"; // allow unsigned only in local dev
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** wa.me deep link that opens a chat with the bot with text pre-filled. */
export function waLink(text: string): string | null {
  const num = env.waDisplayNumber();
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : null;
}
