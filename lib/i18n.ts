import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type Lang = "sw" | "en";

// Common Swahili words; two or more hits (or one strong one) means the message is Swahili.
const SW = /\b(habari|mambo|asante|sana|nataka|naitwa|mchango|michango|kuchangia|changia|ahadi|harusi|msiba|ada|shule|tafadhali|ndiyo|hapana|sawa|kwa|ya|wa|na|ni|yangu|wangu|nipe|nisaidie|kutoa|lipa|kulipa|pesa|fedha|dola|shilingi|leo|kesho|mwezi|tarehe|karibu|samahani|vipi|gani|nini|lini|wapi|ripoti|wakumbushe|thibitisha|ghairi)\b/gi;
const SW_STRONG = /\b(habari|asante|nataka|naitwa|mchango|michango|tafadhali|nipe|wakumbushe|thibitisha|ghairi|samahani)\b/i;

export function detectLang(text: string): Lang | null {
  const t = text.trim();
  if (!t) return null;
  // Short commands ("CONFIRM 123456", "Contribute NEEMA24") are not real language signals; see commandLang.
  if (/^(confirm|cancel|contribute|thibitisha|ghairi|changia)\b/i.test(t) && t.split(/\s+/).length <= 3) return null;
  if (SW_STRONG.test(t)) return "sw";
  const hits = t.match(SW)?.length ?? 0;
  const words = t.split(/\s+/).length;
  if (hits >= 2 || (words <= 3 && hits >= 1)) return "sw";
  return /[a-z]{3,}/i.test(t) ? "en" : null;
}

/**
 * Weak hint from a share-card command: the wa.me link pre-fills "Contribute CODE" on English
 * cards and "Changia CODE" on Swahili ones, so a newcomer who only tapped the link gets the
 * organiser's language instead of the +255 default.
 */
function commandLang(text: string): Lang | null {
  const t = text.trim();
  if (/^contribute\b/i.test(t)) return "en";
  if (/^changia\b/i.test(t)) return "sw";
  return null;
}

/**
 * Language a person writes in: the latest real message wins; failing that a share-card
 * command; failing that, Tanzanian numbers default to Swahili and others to English.
 */
export async function langOf(phone: string): Promise<Lang> {
  const db = await getDb();
  const rows = await db
    .select({ text: schema.chatLog.text })
    .from(schema.chatLog)
    .where(and(eq(schema.chatLog.phone, phone), eq(schema.chatLog.direction, "in")))
    .orderBy(desc(schema.chatLog.id))
    .limit(5);
  for (const r of rows) {
    const l = detectLang(r.text);
    if (l) return l;
  }
  for (const r of rows) {
    const l = commandLang(r.text);
    if (l) return l;
  }
  return phone.replace(/^sim:/, "").startsWith("255") ? "sw" : "en";
}

/** Pick the Swahili or English variant. */
export const t = (lang: Lang, sw: string, en: string) => (lang === "sw" ? sw : en);

/** WhatsApp only understands *bold* and _italic_; models often emit Markdown. */
export function toWhatsAppFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
}
