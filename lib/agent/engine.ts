import "server-only";
import { generateText, isStepCount, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { desc, eq } from "drizzle-orm";
import { env } from "../env";
import { getDb, schema } from "../db";
import { logInbound, sendTo } from "../channels/messaging";
import * as core from "../services/core";
import { buildTools } from "./tools";
import { systemPrompt } from "./prompt";

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

function model() {
  if (modelOverride) return modelOverride;
  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey() });
  return google(env.geminiModel());
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

async function process(msg: Incoming): Promise<void> {
  const user = await core.getOrCreateUser(msg.phone, msg.channel, msg.profileName);
  const text = (msg.text ?? "").trim();
  await logInbound(msg.phone, text || (msg.audio ? "🎤 [voice note]" : "[unsupported message]"));

  // Deterministic money paths: never routed through the LLM.
  const confirm = /^\s*(confirm|thibitisha)\s+(\d{6})\s*$/i.exec(text);
  if (confirm) return sendTo(msg.phone, await core.confirmPayoutByCode(user, confirm[2]));
  const cancel = /^\s*(cancel|ghairi)\s+(\d{6})\s*$/i.exec(text);
  if (cancel) return sendTo(msg.phone, await core.cancelPayoutByCode(user, cancel[2]));

  if (!text && !msg.audio) {
    return sendTo(msg.phone, "I can read text and listen to voice notes 🙂 Please send one of those.");
  }
  if (!env.geminiApiKey() && !modelOverride) {
    return sendTo(msg.phone, "⚙️ The AI brain isn't configured yet (missing GEMINI_API_KEY).");
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
    const result = await generateText({
      model: model(),
      system: systemPrompt({
        user,
        owned: ownedSummary,
        active,
        channel: msg.channel,
        today: new Date().toISOString().slice(0, 10),
      }),
      messages: [...(await history(msg.phone)), current],
      tools: buildTools(ctx),
      stopWhen: isStepCount(8),
      temperature: 0.3,
    });
    const reply = result.text.trim();
    if (reply) await sendTo(msg.phone, reply);
  } catch (e) {
    console.error("[agent] generation failed", e);
    await sendTo(msg.phone, "😕 Sorry, I hit a problem just now. Please try again in a moment.");
  }
}
