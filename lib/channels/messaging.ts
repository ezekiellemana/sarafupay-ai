import "server-only";
import { getDb, schema } from "../db";
import { sendWhatsAppText } from "./whatsapp";
import { toWhatsAppFormat } from "../i18n";

export function isSimPhone(phone: string) {
  return phone.startsWith("sim:");
}

export async function logInbound(phone: string, text: string) {
  const db = await getDb();
  await db.insert(schema.chatLog).values({ phone, direction: "in", text });
}

/** Sends a message to a user on their channel and records it in the chat log. */
export async function sendTo(phone: string, raw: string): Promise<void> {
  const text = toWhatsAppFormat(raw);
  const db = await getDb();
  await db.insert(schema.chatLog).values({ phone, direction: "out", text });
  if (!isSimPhone(phone)) await sendWhatsAppText(phone, text);
}
