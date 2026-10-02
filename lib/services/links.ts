import { env } from "../env";
import { waLink } from "../channels/whatsapp";
import type { Collection } from "../db/schema";
import { money } from "../format";

export const payUrl = (contributionId: string) => `${env.appUrl()}/pay/${contributionId}`;
export const collectionUrl = (code: string) => `${env.appUrl()}/c/${code}`;
export const dashboardUrl = (c: Collection) => `${env.appUrl()}/d/${c.code}?key=${c.ownerKey}`;
export const simulatorUrl = (text?: string) =>
  `${env.appUrl()}/chat${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Ready-to-forward message for WhatsApp groups. */
export function shareMessage(c: Collection, ownerName?: string | null): string {
  const join = `Contribute ${c.code}`;
  const wa = waLink(join);
  return [
    `🤝 *${c.title}*`,
    c.purpose ? c.purpose : null,
    `Target: *${money(c.targetCents, c.currency)}*${c.deadline ? ` by ${c.deadline}` : ""}`,
    ownerName ? `Organised by ${ownerName}` : null,
    "",
    wa ? `💬 Chip in on WhatsApp: ${wa}` : `💬 Chat to contribute: ${simulatorUrl(join)}`,
    `💳 Or pay on the web: ${collectionUrl(c.code)}`,
    "",
    `Every payment and payout is tracked transparently by SarafuPay (PayPal).`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
