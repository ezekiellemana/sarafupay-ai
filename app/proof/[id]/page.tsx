import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, SandboxBadge } from "@/components/brand";
import { getCollectionById } from "@/lib/services/core";
import { cardsForRecord, chainFor, checkCard, firstBroken, getCard, signingKey, type EvidenceBody } from "@/lib/services/evidence";
import { money } from "@/lib/format";
import { VerifyButton } from "./verify-button";

export const metadata = { title: "SarafuPay — signed proof", robots: { index: false } };

const EVENT: Record<EvidenceBody["event"], { label: string; verb: string; tone: string }> = {
  payment_received: { label: "Payment received", verb: "paid in", tone: "bg-forest/10 text-forest" },
  payout_sent: { label: "Payout sent", verb: "was paid", tone: "bg-forest/10 text-forest" },
  payout_failed: { label: "Payout failed", verb: "was not paid", tone: "bg-terracotta/10 text-terracotta" },
};

const AUTH: Record<EvidenceBody["authorised_by"], string> = {
  payer_via_paypal: "The payer, by approving the payment at PayPal",
  organiser_confirm_code: "The organiser, by replying with a one-time CONFIRM code (the AI can't move money)",
};

const stamp = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export default async function ProofPage({ params }: PageProps<"/proof/[id]">) {
  await connection();
  const { id } = await params;
  const card = await getCard(id);
  if (!card) notFound();
  const body = JSON.parse(card.body) as EvidenceBody;
  const [col, chain, history] = await Promise.all([getCollectionById(card.collectionId), chainFor(card.collectionId), cardsForRecord(card.recordId)]);
  const own = checkCard(card, chain.find((c) => c.seq === card.seq - 1));
  const brokenAt = firstBroken(chain);
  const key = signingKey();
  const ev = EVENT[body.event];
  const cur = body.currency;
  const refs = Object.entries(body.paypal).filter((e): e is [string, string] => Boolean(e[1]));

  return (
    <div className="min-h-screen">
      <div className="kanga" />
      <header className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <Logo />
        <SandboxBadge />
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
          Card #{card.seq} of {chain.length} · {col?.title ?? body.collection.code}
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold sm:text-4xl">Signed proof</h1>
        <p className="mt-2 text-sm text-ink-soft">
          SarafuPay signs every payment and payout into this collection&apos;s chain the moment it happens. Anyone can check that this record hasn&apos;t been changed, and that none before it was removed.
        </p>

        <section className="card mt-6 p-5 sm:p-6">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${ev.tone}`}>{ev.label}</span>
          <p className="mt-4 text-lg">
            {body.event === "payment_received" ? (
              <>
                <strong>{body.party}</strong> {ev.verb} <strong>{money(body.amount_cents, cur)}</strong>
              </>
            ) : (
              <>
                <strong>{money(body.amount_cents, cur)}</strong> {ev.verb} to <strong>{body.party}</strong>
                {body.purpose ? <span className="text-ink-soft"> for {body.purpose}</span> : null}
              </>
            )}
          </p>
          {body.failure ? <p className="mt-1 text-sm text-terracotta">{body.failure}. The money stayed in the collection.</p> : null}
          <p className="mt-1 text-sm text-ink-soft">{stamp(body.at)}</p>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-soft">Authorised by</dt>
              <dd>{AUTH[body.authorised_by]}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">PayPal references</dt>
              <dd className="break-all font-mono text-xs">
                {refs.length ? refs.map(([k, v]) => <span key={k} className="block">{k.replace("_", " ")} {v}</span>) : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-soft">The collection right after</dt>
              <dd>
                Raised <strong>{money(body.totals.raised_cents, cur)}</strong> · Paid out <strong>{money(body.totals.paid_out_cents, cur)}</strong> · Balance{" "}
                <strong>{money(body.totals.balance_cents, cur)}</strong>
              </dd>
            </div>
          </dl>
        </section>

        {history.length > 1 ? (
          <section className="card mt-4 p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold">This record&apos;s history</h2>
            <ol className="mt-3 space-y-1.5 text-sm">
              {history.map((h) => {
                const hb = JSON.parse(h.body) as EvidenceBody;
                return (
                  <li key={h.id} className="flex flex-wrap gap-x-3">
                    <span className="font-mono text-xs text-ink-soft">#{h.seq}</span>
                    {h.id === card.id ? <strong>{EVENT[hb.event].label}</strong> : <Link href={`/proof/${h.id}`} className="underline">{EVENT[hb.event].label}</Link>}
                    <span className="text-ink-soft">{stamp(hb.at)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="card mt-4 p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">Integrity</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(
              [
                [own.hashOk, "Content matches its fingerprint (sha256)"],
                [own.sigOk, "Signed by SarafuPay (Ed25519)"],
                [own.linkOk, card.seq === 1 ? "First card in the chain" : "Linked to the card before it"],
                [brokenAt === undefined, brokenAt === undefined ? `Whole chain of ${chain.length} card${chain.length === 1 ? "" : "s"} intact` : `Chain broken at card #${brokenAt}`],
              ] as const
            ).map(([ok, label]) => (
              <li key={label} className={ok ? "text-forest" : "font-semibold text-terracotta"}>
                {ok ? "✓" : "✗"} {label}
              </li>
            ))}
          </ul>
          {key.dev ? <p className="mt-3 rounded-lg bg-marigold/25 px-3 py-2 text-xs">Signed with a development key: this is a test deployment.</p> : null}
          <div className="mt-4">
            <VerifyButton
              id={card.id}
              labels={{ idle: "Verify in my browser", busy: "Verifying…", ok: "Signature valid", bad: "Doesn't verify", unsupported: "This browser can't check Ed25519 signatures yet." }}
            />
          </div>
          <p className="mt-3 break-all font-mono text-[11px] text-ink-soft">
            sha256 {card.hash}
            <br />
            key {key.publicKey}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-soft">Signed data (JSON)</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-paper-2 p-3 text-[11px] leading-relaxed">{JSON.stringify(body, null, 2)}</pre>
          </details>
        </section>

        {col ? (
          <Link href={`/c/${col.code}`} className="btn btn-ghost mt-6">
            ← Back to {col.title}
          </Link>
        ) : null}
      </main>
    </div>
  );
}
