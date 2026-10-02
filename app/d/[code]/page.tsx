import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, SandboxBadge } from "@/components/brand";
import { ownerCollection } from "@/lib/studio/auth";
import { collectionStats, listContributions, listPayouts, listPledges } from "@/lib/services/core";
import { money } from "@/lib/format";
import { collectionUrl } from "@/lib/services/links";
import { StudioDashboard, type DashboardData } from "./studio-dashboard";

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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden h-8 w-px bg-line sm:block" />
          <div>
            <p className="font-display text-lg font-semibold leading-tight">{col.title}</p>
            <p className="font-mono text-xs text-ink-soft">
              {col.code} · {money(stats.raisedCents, col.currency)} of {money(col.targetCents, col.currency)} ({stats.percent}%) ·
              balance {money(stats.availableCents, col.currency)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SandboxBadge />
          <a href={collectionUrl(col.code)} className="text-sm underline" target="_blank" rel="noreferrer">
            Public page ↗
          </a>
        </div>
      </header>
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
