import { env } from "../env";
import { waLink } from "../channels/whatsapp";
import type { Collection } from "../db/schema";
import { money } from "../format";
import { t, type Lang } from "../i18n";

export const payUrl = (contributionId: string) => `${env.appUrl()}/pay/${contributionId}`;
export const collectionUrl = (code: string) => `${env.appUrl()}/c/${code}`;
export const dashboardUrl = (c: Collection) => `${env.appUrl()}/d/${c.code}?key=${c.ownerKey}`;
export const simulatorUrl = (text?: string) =>
  `${env.appUrl()}/chat${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Ready-to-forward message for WhatsApp groups, in the organiser's language. */
export function shareMessage(c: Collection, ownerName?: string | null, lang: Lang = "en"): string {
  const join = `Contribute ${c.code}`;
  const wa = waLink(join);
  const target = money(c.targetCents, c.currency);
  return [
    `🤝 *${c.title}*`,
    c.purpose ? c.purpose : null,
    t(lang, `Lengo: *${target}*${c.deadline ? ` kufikia ${c.deadline}` : ""}`, `Target: *${target}*${c.deadline ? ` by ${c.deadline}` : ""}`),
    ownerName ? t(lang, `Imeandaliwa na ${ownerName}`, `Organised by ${ownerName}`) : null,
    "",
    wa
      ? t(lang, `💬 Changia kupitia WhatsApp: ${wa}`, `💬 Chip in on WhatsApp: ${wa}`)
      : t(lang, `💬 Changia kwa chat: ${simulatorUrl(join)}`, `💬 Chat to contribute: ${simulatorUrl(join)}`),
    t(lang, `💳 Au lipa mtandaoni: ${collectionUrl(c.code)}`, `💳 Or pay on the web: ${collectionUrl(c.code)}`),
    "",
    t(
      lang,
      `Kila malipo na kila matumizi yanafuatiliwa kwa uwazi na SarafuPay (PayPal).`,
      `Every payment and payout is tracked transparently by SarafuPay (PayPal).`,
    ),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
