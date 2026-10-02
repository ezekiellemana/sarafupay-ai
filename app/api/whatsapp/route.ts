import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { downloadWhatsAppMedia, markRead, verifyMetaSignature } from "@/lib/channels/whatsapp";
import { handleIncoming } from "@/lib/agent/engine";

// Meta webhook verification handshake.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === env.waVerifyToken() && env.waVerifyToken()) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
};
type WaPayload = {
  entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id: string }[]; messages?: WaMessage[] } }[] }[];
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }
  const payload = JSON.parse(raw) as WaPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const m of value?.messages ?? []) {
        const profileName = value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        // Respond to Meta immediately; do the AI work after the response is sent.
        after(async () => {
          void markRead(m.id);
          let text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
          let audio: { data: Uint8Array; mimeType: string } | undefined;
          if (m.type === "audio" && m.audio?.id) {
            try {
              audio = await downloadWhatsAppMedia(m.audio.id);
            } catch (e) {
              console.error("[whatsapp] audio download failed", e);
              text = text ?? "(voice note could not be downloaded)";
            }
          }
          await handleIncoming({ phone: m.from, channel: "whatsapp", profileName, text, audio });
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
