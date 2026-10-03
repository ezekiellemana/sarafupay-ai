import Link from "next/link";
import { Logo } from "@/components/brand";

export const metadata = {
  title: "Privacy Policy — SarafuPay",
  description: "How SarafuPay handles your data when you use the WhatsApp agent, web simulator and treasurer dashboard.",
};

const UPDATED = "3 October 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="kanga" />
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 leading-relaxed">
        <h1 className="font-display text-4xl font-semibold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated {UPDATED}</p>

        <Section title="Who we are">
          SarafuPay is a hackathon project by Ezekiel Lemana (Dodoma, Tanzania), built for the PayPal AI Hackathon 2026. It
          helps groups run collections (michango) through a WhatsApp agent. All payments run on the{" "}
          <strong>PayPal sandbox</strong>: no real money moves. Contact:{" "}
          <a className="underline" href="mailto:ezekielaugustino@gmail.com">
            ezekielaugustino@gmail.com
          </a>
          .
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>Your WhatsApp phone number and profile name, so the agent can reply to you.</li>
            <li>The messages and voice notes you send the agent, and its replies, kept as conversation history.</li>
            <li>The details you give: your name, collection titles, targets, pledges and an optional PayPal email for payouts.</li>
            <li>
              Payment references returned by PayPal (order and capture IDs, payer name and email). We never see or store card
              or bank details; checkout happens on PayPal.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          Only to run the service: creating collections, sending pay links, receipts, reminders and transparency updates,
          preparing payouts that the organiser confirms with a one-time code, and showing the organiser&apos;s private
          dashboard. The public collection page shows totals, the payout ledger and each supporter&apos;s first name and
          optional message, never amounts or emails (an email search there only matches a full, exact address). Full
          names and amounts are visible only to that collection&apos;s organiser.
        </Section>

        <Section title="Who processes it">
          <ul className="list-disc space-y-1 pl-5">
            <li>Meta (WhatsApp Cloud API), to deliver messages.</li>
            <li>Google (Gemini API), to understand messages and write replies.</li>
            <li>PayPal (sandbox), to process test payments and payouts.</li>
            <li>Render, which hosts the app and its database.</li>
          </ul>
          We do not sell your data or use it for advertising.
        </Section>

        <Section title="Retention and deletion">
          Data is kept for the duration of the hackathon and its judging, then deleted. You can ask us to delete your data
          at any time by emailing the address above; we will remove it within 7 days.
        </Section>

        <Section title="Security">
          Webhooks from Meta and PayPal are signature-verified, dashboards are protected by a private owner key, and money
          can only move after the organiser&apos;s own confirmation code.
        </Section>

        <Section title="Changes">
          If this policy changes we will update the date at the top of this page.
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-2 text-ink-soft">{children}</div>
    </section>
  );
}
