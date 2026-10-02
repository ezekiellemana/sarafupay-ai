import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, Progress, SandboxBadge } from "@/components/brand";
import { collectionStats, findCollection, getUser, listContributions, listPayouts } from "@/lib/services/core";
import { money } from "@/lib/format";
import { waLink } from "@/lib/channels/whatsapp";
import { simulatorUrl } from "@/lib/services/links";
import { contributeAction } from "./actions";

const categoryEmoji: Record<string, string> = {
  wedding: "💍", funeral: "🕊️", medical: "🩺", education: "🎓", community: "🏘️", nonprofit: "🤝", celebration: "🎉", other: "✨",
};

export default async function CollectionPage({ params, searchParams }: PageProps<"/c/[code]">) {
  await connection();
  const { code } = await params;
  const sp = await searchParams;
  const col = await findCollection(code);
  if (!col) notFound();
  const [stats, owner, paid, pays] = await Promise.all([
    collectionStats(col),
    getUser(col.ownerId),
    listContributions(col.id, "paid"),
    listPayouts(col.id),
  ]);
  const ledger = pays.filter((p) => p.status === "success" || p.status === "processing");
  const chat = waLink(`Contribute ${col.code}`) ?? simulatorUrl(`Contribute ${col.code}`);
  const presets = [10, 20, 50, 100];
  const err = typeof sp.err === "string" ? sp.err : null;

  return (
    <div className="min-h-screen">
      <div className="kanga" />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <SandboxBadge />
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-6 pb-20 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rise">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            {categoryEmoji[col.category] ?? "✨"} {col.category} · code {col.code}
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight sm:text-6xl">{col.title}</h1>
          {col.purpose ? <p className="mt-4 max-w-xl text-lg text-ink-soft leading-relaxed">{col.purpose}</p> : null}
          <p className="mt-3 text-sm text-ink-soft">
            Organised by <strong className="text-ink">{owner?.name ?? "the organiser"}</strong>
            {col.deadline ? <> · closes {col.deadline}</> : null}
            {col.status !== "active" ? <> · <span className="text-terracotta font-semibold">closed</span></> : null}
          </p>

          <div className="card mt-8 p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-4xl font-semibold">{money(stats.raisedCents, col.currency)}</p>
                <p className="text-sm text-ink-soft">raised of {money(col.targetCents, col.currency)} goal</p>
              </div>
              <p className="font-mono text-2xl text-forest-2">{stats.percent}%</p>
            </div>
            <div className="mt-4"><Progress percent={stats.percent} /></div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div><p className="font-semibold">{stats.paidCount}</p><p className="text-ink-soft">contributions</p></div>
              <div><p className="font-semibold">{money(stats.paidOutCents, col.currency)}</p><p className="text-ink-soft">paid out</p></div>
              <div><p className="font-semibold">{money(stats.availableCents, col.currency)}</p><p className="text-ink-soft">balance</p></div>
            </div>
          </div>

          <h2 className="font-display mt-10 text-2xl font-semibold">Where the money went</h2>
          {ledger.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No payouts yet. Every payout will be listed here and sent to contributors.</p>
          ) : (
            <ul className="mt-3">
              {ledger.map((p) => (
                <li key={p.id} className="ledger-row flex items-baseline justify-between gap-4 py-3">
                  <span>
                    <strong>{p.recipientName ?? "Recipient"}</strong>
                    {p.note ? <span className="text-ink-soft"> · {p.note}</span> : null}
                    {p.status === "processing" ? <span className="ml-2 text-xs text-marigold">processing</span> : null}
                  </span>
                  <span className="font-mono">{money(p.amountCents, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}

          {paid.length > 0 ? (
            <>
              <h2 className="font-display mt-10 text-2xl font-semibold">Recent supporters</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {paid.slice(0, 24).map((c) => (
                  <span key={c.id} className="rounded-full bg-paper-2 px-3 py-1 text-sm ring-1 ring-line">
                    {c.displayName.split(" ")[0]}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <aside className="rise d2 lg:sticky lg:top-6 h-fit">
          <form action={contributeAction.bind(null, col.code)} className="card overflow-hidden">
            <div className="bg-forest px-6 py-4 text-paper">
              <p className="font-display text-2xl font-semibold">Chip in</p>
              <p className="text-sm opacity-80">Secure checkout with PayPal</p>
            </div>
            <div className="space-y-4 p-6">
              {sp.cancelled ? <p className="rounded-lg bg-paper-2 p-3 text-sm">Payment cancelled. No money moved.</p> : null}
              {err ? <p className="rounded-lg bg-terracotta/10 p-3 text-sm text-terracotta">{err === "amount" ? "Please enter a valid amount." : err}</p> : null}
              <fieldset>
                <legend className="text-sm font-medium">Amount ({col.currency})</legend>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {presets.map((v) => (
                    <label key={v} className="cursor-pointer">
                      <input type="radio" name="amount" value={v} className="peer sr-only" defaultChecked={v === 20} />
                      <span className="block rounded-xl border border-line py-2 text-center font-mono peer-checked:border-forest peer-checked:bg-forest peer-checked:text-paper">
                        {v}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium">
                Or another amount
                <input name="amount_custom" inputMode="decimal" placeholder="e.g. 35" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono" />
              </label>
              <label className="block text-sm font-medium">
                Your name
                <input name="name" required maxLength={80} placeholder="Shown to the organiser" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Message <span className="text-ink-soft font-normal">(optional)</span>
                <input name="message" maxLength={280} placeholder="Hongera! 🎉" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
              </label>
              <button disabled={col.status !== "active"} className="btn btn-primary w-full justify-center disabled:opacity-50">
                Continue to PayPal →
              </button>
              <p className="text-center text-xs text-ink-soft">
                Prefer chatting? <a href={chat} className="underline">Contribute with the AI agent</a>
              </p>
            </div>
          </form>
        </aside>
      </main>
    </div>
  );
}
