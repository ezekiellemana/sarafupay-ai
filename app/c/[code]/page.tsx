import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, Progress, SandboxBadge } from "@/components/brand";
import { collectionStats, findCollection, getUser, listPayouts, searchSupporters, type Supporter } from "@/lib/services/core";
import { money } from "@/lib/format";
import { waLink } from "@/lib/channels/whatsapp";
import { simulatorUrl } from "@/lib/services/links";
import { contributeAction } from "./actions";
import { AmountInput } from "./amount-input";
import { SupporterSearch } from "./supporter-search";

const categoryEmoji: Record<string, string> = {
  wedding: "💍", funeral: "🕊️", medical: "🩺", education: "🎓", community: "🏘️", nonprofit: "🤝", celebration: "🎉", other: "✨",
};

export default async function CollectionPage({ params, searchParams }: PageProps<"/c/[code]">) {
  await connection();
  const { code } = await params;
  const sp = await searchParams;
  const col = await findCollection(code);
  if (!col) notFound();
  const q = typeof sp.q === "string" ? sp.q : "";
  const pageNo = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const [stats, owner, supporters, pays] = await Promise.all([
    collectionStats(col),
    getUser(col.ownerId),
    searchSupporters(col.id, { q, page: pageNo, pageSize: 8 }),
    listPayouts(col.id),
  ]);
  const ledger = pays.filter((p) => p.status === "success" || p.status === "processing");
  const chat = waLink(`Contribute ${col.code}`) ?? simulatorUrl(`Contribute ${col.code}`);
  const err = typeof sp.err === "string" ? sp.err : null;

  return (
    <div className="min-h-screen">
      <div className="kanga" />
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <Logo />
        <SandboxBadge />
      </header>
      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-5 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="rise min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            {categoryEmoji[col.category] ?? "✨"} {col.category} · code {col.code}
          </p>
          <h1 className="font-display mt-3 break-words text-[2.25rem] font-semibold leading-tight sm:text-6xl">{col.title}</h1>
          {col.purpose ? <p className="mt-4 max-w-xl text-lg text-ink-soft leading-relaxed">{col.purpose}</p> : null}
          <p className="mt-3 text-sm text-ink-soft">
            Organised by <strong className="text-ink">{owner?.name ?? "the organiser"}</strong>
            {col.deadline ? <> · closes {col.deadline}</> : null}
            {col.status !== "active" ? <> · <span className="text-terracotta font-semibold">closed</span></> : null}
          </p>

          <div className="card mt-8 p-5 sm:p-6">
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
          {col.status === "active" ? (
            <a href="#chip-in" className="btn btn-primary mt-4 w-full justify-center lg:hidden">
              Chip in with PayPal ↓
            </a>
          ) : null}

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

          {stats.paidCount > 0 ? (
            <section id="supporters" className="mt-10 scroll-mt-4">
              <h2 className="font-display text-2xl font-semibold">Recent supporters</h2>
              <div className="mt-3">
                <Suspense fallback={null}>
                  <SupporterSearch initial={q} />
                </Suspense>
              </div>
              <SupporterList items={supporters.items} q={q} byEmail={supporters.byEmail} />
              {supporters.pages > 1 ? (
                <Pager code={col.code} q={q} page={supporters.page} pages={supporters.pages} total={supporters.total} />
              ) : null}
            </section>
          ) : null}
        </section>

        <aside id="chip-in" className="rise d2 min-w-0 h-fit scroll-mt-4 lg:sticky lg:top-6">
          <form action={contributeAction.bind(null, col.code)} className="card overflow-hidden">
            <div className="bg-forest px-6 py-4 text-paper">
              <p className="font-display text-2xl font-semibold">Chip in</p>
              <p className="text-sm opacity-80">Secure checkout with PayPal</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {sp.cancelled ? <p className="rounded-lg bg-paper-2 p-3 text-sm">Payment cancelled. No money moved.</p> : null}
              {err ? <p className="rounded-lg bg-terracotta/10 p-3 text-sm text-terracotta">{err === "amount" ? "Please enter a valid amount." : err}</p> : null}
              <AmountInput currency={col.currency} />
              <label className="block text-sm font-medium">
                Your name
                <input name="name" required maxLength={80} placeholder="Only your first name is shown publicly" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-base" />
              </label>
              <label className="block text-sm font-medium">
                Message <span className="text-ink-soft font-normal">(optional)</span>
                <input name="message" maxLength={280} placeholder="Hongera! 🎉" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-base" />
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

const AVATAR_TONES = ["bg-marigold/30", "bg-forest/15", "bg-terracotta/20", "bg-paper-2"];

function ago(d: Date): string {
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12], ["year", Infinity]];
  let v = s;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

function SupporterList({ items, q, byEmail }: { items: Supporter[]; q: string; byEmail: boolean }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
        {byEmail ? (
          <>No contribution found for that email. Check it&apos;s the email you used on PayPal.</>
        ) : (
          <>No supporters named &ldquo;{q}&rdquo; yet.</>
        )}
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-[#fffaf0]">
      {items.map((s, i) => (
        <li key={s.id} className="supporter-row flex items-start gap-3 px-4 py-3" style={{ animationDelay: `${i * 30}ms` }}>
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-semibold text-ink ${AVATAR_TONES[s.name.charCodeAt(0) % AVATAR_TONES.length]}`}
            aria-hidden
          >
            {s.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate font-semibold">{s.name}</p>
              <time dateTime={s.paidAt.toISOString()} className="shrink-0 text-xs text-ink-soft">
                {ago(s.paidAt)}
              </time>
            </div>
            {s.message ? <p className="mt-0.5 break-words text-sm text-ink-soft">&ldquo;{s.message}&rdquo;</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Pager({ code, q, page, pages, total }: { code: string; q: string; page: number; pages: number; total: number }) {
  const href = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return `/c/${code}${qs ? `?${qs}` : ""}#supporters`;
  };
  // 1 … 4 5 6 … 12
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const cells: (number | "gap")[] = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) cells.push("gap");
    cells.push(n);
  });
  const base = "grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm transition-colors";
  return (
    <nav aria-label="Supporters pages" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-ink-soft">
        Page {page} of {pages} · {total} supporters
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} scroll={false} className={`${base} border border-line hover:border-forest`} aria-label="Previous page">
            ‹
          </Link>
        ) : null}
        {cells.map((c, i) =>
          c === "gap" ? (
            <span key={`g${i}`} className="hidden px-1 text-ink-soft sm:inline">…</span>
          ) : (
            <Link
              key={c}
              href={href(c)}
              scroll={false}
              aria-current={c === page ? "page" : undefined}
              className={`${base} hidden sm:grid ${c === page ? "!grid bg-forest font-semibold text-paper" : "hover:bg-paper-2"}`}
            >
              {c}
            </Link>
          ),
        )}
        {page < pages ? (
          <Link href={href(page + 1)} scroll={false} className={`${base} border border-line hover:border-forest`} aria-label="Next page">
            ›
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
