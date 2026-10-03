import "server-only";
import { generateText, isStepCount, type ModelMessage } from "ai";
import { desc, eq } from "drizzle-orm";
import { env } from "../env";
import { getDb, schema } from "../db";
import { logInbound, sendTo } from "../channels/messaging";
import * as core from "../services/core";
import { buildTools } from "./tools";
import { systemPrompt } from "./prompt";
import { withGeminiFallback } from "./models";
import { langOf, t } from "../i18n";
import { takeAiCall } from "../limits";

export type Incoming = {
  phone: string; // digits for WhatsApp, "sim:<digits>" for simulator
  channel: "whatsapp" | "sim";
  profileName?: string;
  text?: string;
  audio?: { data: Uint8Array; mimeType: string };
};

// Serialise messages per phone so replies stay in order.
const queues = new Map<string, Promise<unknown>>();
export function handleIncoming(msg: Incoming): Promise<void> {
  const prev = queues.get(msg.phone) ?? Promise.resolve();
  const next = prev.then(() => process(msg)).catch((e) => console.error("[agent]", e));
  queues.set(msg.phone, next);
  void next.finally(() => {
    if (queues.get(msg.phone) === next) queues.delete(msg.phone);
  });
  return next as Promise<void>;
}

let modelOverride: Parameters<typeof generateText>[0]["model"] | undefined;
/** Test hook: inject a mock language model. */
export function __setModelForTests(m: typeof modelOverride) {
  modelOverride = m;
}


async function history(phone: string, limit = 16): Promise<ModelMessage[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.chatLog)
    .where(eq(schema.chatLog.phone, phone))
    .orderBy(desc(schema.chatLog.id))
    .limit(limit + 1);
  rows.reverse();
  rows.pop(); // drop the message we just logged; it's sent separately (may include audio)
  return rows.map((r) =>
    r.direction === "in" ? { role: "user" as const, content: r.text } : { role: "assistant" as const, content: r.text },
  );
}

async function process(msg: Incoming): Promise<unknown> {
  const user = await core.getOrCreateUser(msg.phone, msg.channel, msg.profileName);
  const text = (msg.text ?? "").trim();
  await logInbound(msg.phone, text || (msg.audio ? "🎤 [voice note]" : "[unsupported message]"));

  // Deterministic money paths: never routed through the LLM.
  const confirm = /^\s*(confirm|thibitisha)\s+(\d{6})\s*$/i.exec(text);
  if (confirm) return sendTo(msg.phone, await core.confirmPayoutByCode(user, confirm[2]));
  const cancel = /^\s*(cancel|ghairi)\s+(\d{6})\s*$/i.exec(text);
  if (cancel) return sendTo(msg.phone, await core.cancelPayoutByCode(user, cancel[2]));

  if (!text && !msg.audio) {
    return sendTo(msg.phone, t(await langOf(msg.phone), "Ninasoma maandishi na kusikiliza voice notes 🙂 Tafadhali tuma mojawapo.", "I can read text and listen to voice notes 🙂 Please send one of those."));
  }
  if (!env.geminiApiKey() && !modelOverride) {
    return sendTo(msg.phone, "⚙️ The AI brain isn't configured yet (missing GEMINI_API_KEY).");
  }

  const gate = modelOverride ? { ok: true as const } : takeAiCall(msg.phone);
  if (!gate.ok) {
    if (!gate.notify) return;
    const L = await langOf(msg.phone);
    return sendTo(
      msg.phone,
      gate.reason === "sender"
        ? t(L, "⏳ Ujumbe ni mwingi kwa muda mfupi. Tafadhali subiri dakika chache kisha uendelee.", "⏳ That's a lot of messages in a short time. Please wait a few minutes and continue.")
        : t(L, "⏳ SarafuPay ina shughuli nyingi leo. Tafadhali jaribu tena baadaye.", "⏳ SarafuPay is very busy today. Please try again later."),
    );
  }

  const owned = await core.listOwnedCollections(user.id);
  const ownedSummary = await Promise.all(
    owned.slice(0, 5).map(async (c) => ({ code: c.code, title: c.title, progress: core.statusLine(c, await core.collectionStats(c)) })),
  );
  const active = user.activeCollectionId ? await core.getCollectionById(user.activeCollectionId) : null;
  const ctx = { user, channel: msg.channel };

  const current: ModelMessage = msg.audio
    ? {
        role: "user",
        content: [
          { type: "text", text: text || "(voice note — listen, transcribe mentally, and respond to what they asked)" },
          { type: "file", data: msg.audio.data, mediaType: msg.audio.mimeType },
        ],
      }
    : { role: "user", content: text };

  try {
    const system = systemPrompt({
      user,
      owned: ownedSummary,
      active,
      channel: msg.channel,
      today: new Date().toISOString().slice(0, 10),
      lang: await langOf(msg.phone),
    });
    const messages = [...(await history(msg.phone)), current];
    const run = (model: Parameters<typeof generateText>[0]["model"]) =>
      generateText({
        model,
        system,
        messages,
        tools: buildTools(ctx),
        stopWhen: isStepCount(8),
        maxOutputTokens: 1200, // WhatsApp replies are short; caps cost per step
        temperature: 0.3,
        maxRetries: 1,
      });
    const result = modelOverride ? await run(modelOverride) : await withGeminiFallback((m) => run(m));
    const reply = result.text.trim();
    if (reply) await sendTo(msg.phone, reply);
  } catch (e) {
    console.error("[agent] generation failed", e);
    await sendTo(msg.phone, t(await langOf(msg.phone), "😕 Samahani, nimepata hitilafu kidogo. Tafadhali jaribu tena baada ya muda mfupi.", "😕 Sorry, I hit a problem just now. Please try again in a moment."));
  }
}
