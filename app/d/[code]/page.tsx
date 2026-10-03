import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, Progress, SandboxBadge } from "@/components/brand";
import { ownerCollection } from "@/lib/studio/auth";
import { collectionStats, listContributions, listPayouts, listPledges } from "@/lib/services/core";
import { money } from "@/lib/format";
import { collectionUrl } from "@/lib/services/links";
import { StudioDashboard, type DashboardData } from "./studio-dashboard";
import { CopyLink } from "./copy-link";

export const metadata = { title: "SarafuPay — treasurer dashboard", robots: { index: false } };

export default async function DashboardPage({ params, searchParams }: PageProps<"/d/[code]">) {
  await connection();
  const { code } = await params;
  const { key } = await searchParams;
  const col = await ownerCollection(code, typeof key === "string" ? key : null);
  if (!col) notFound();
  const [stats, paid, pledges, payouts] = await Promise.all([
    collectionStats(col),
    listContributions(col.id, "paid"),
    listPledges(col.id),
    listPayouts(col.id),
  ]);
  const data: DashboardData = {
    contributions: paid.map((c) => ({
      contributor: c.displayName,
      amount: c.amountCents / 100,
      channel: c.source === "sim" ? "chat" : c.source,
      paid_on: (c.paidAt ?? c.createdAt).toISOString().slice(0, 10),
      message: c.message ?? "",
      paypal_ref: c.paypalCaptureId ?? "",
    })),
    pledges: pledges.map((p) => ({
      pledger: p.displayName,
      amount: p.amountCents / 100,
      due: p.dueDate ?? "",
      status: p.status,
      reminded: p.remindedAt ? "yes" : "no",
    })),
    payouts: payouts
      .filter((p) => p.status !== "cancelled" && p.status !== "awaiting_confirmation")
      .map((p) => ({
        recipient: p.recipientName ?? p.recipientEmail,
        amount: p.amountCents / 100,
        purpose: p.note ?? "",
        status: p.status,
        sent_on: (p.executedAt ?? p.createdAt).toISOString().slice(0, 10),
      })),
  };
  return (
    <div className="flex h-dvh flex-col">
      <div className="kanga" />
      <header className="border-b border-line bg-[#fffaf0]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <Logo />
          <div className="hidden h-9 w-px bg-line md:block" />
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="truncate font-display text-xl font-semibold leading-tight">{col.title}</h1>
              <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[11px] text-ink-soft">{col.code}</span>
              {col.status !== "active" ? <span className="text-xs font-semibold text-terracotta">closed</span> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="max-w-xs flex-1">
                <Progress percent={stats.percent} />
              </div>
              <p className="shrink-0 text-xs text-ink-soft">
                <strong className="text-ink">{stats.percent}%</strong> of {money(col.targetCents, col.currency)}
                {col.deadline ? <> · closes {col.deadline}</> : null}
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-forest px-4 py-1.5 text-paper">
            <p className="text-[10px] uppercase tracking-widest opacity-75">Balance to pay out</p>
            <p className="font-display text-lg font-semibold leading-tight">{money(stats.availableCents, col.currency)}</p>
          </div>
          <div className="flex items-center gap-2">
            <SandboxBadge />
            <CopyLink url={collectionUrl(col.code)} />
            <a href={collectionUrl(col.code)} className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper" target="_blank" rel="noreferrer">
              Public page ↗
            </a>
          </div>
        </div>
      </header>
      <p className="border-b border-line bg-paper-2 px-5 py-2 text-xs text-ink-soft md:hidden">
        Tip: the treasurer dashboard is built for bigger screens. Rotate your phone or open it on a laptop for the full view.
      </p>
      <main className="min-h-0 flex-1">
        <StudioDashboard
          code={col.code}
          ownerKey={col.ownerKey}
          currency={col.currency}
          data={data}
          licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY ?? ""}
        />
      </main>
    </div>
  );
}
