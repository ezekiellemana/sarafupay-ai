import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, Progress } from "@/components/brand";
import { collectionStats, findCollection, getContribution } from "@/lib/services/core";
import { money } from "@/lib/format";

export default async function Thanks({ params, searchParams }: PageProps<"/c/[code]/thanks">) {
  await connection();
  const { code } = await params;
  const { ctb: ctbId } = await searchParams;
  const col = await findCollection(code);
  if (!col) notFound();
  const ctb = typeof ctbId === "string" ? await getContribution(ctbId) : undefined;
  const stats = await collectionStats(col);
  const paid = ctb?.status === "paid";
  return (
    <div className="min-h-screen">
      <div className="kanga" />
      <main className="mx-auto max-w-lg px-5 py-10 text-center sm:px-6 sm:py-12">
        <Logo />
        <div className="card rise mt-8 p-6 sm:mt-10 sm:p-8">
          <p className="text-5xl">{paid ? "🎉" : "⏳"}</p>
          <h1 className="font-display mt-4 text-3xl font-semibold">{paid ? "Asante sana!" : "Almost there"}</h1>
          <p className="mt-2 text-ink-soft">
            {paid
              ? `${money(ctb!.amountCents, ctb!.currency)} received for ${col.title}.`
              : "We're waiting for PayPal to confirm your payment. You'll get a receipt in chat."}
          </p>
          {paid && ctb?.paypalCaptureId ? <p className="mt-2 font-mono text-xs text-ink-soft">PayPal ref {ctb.paypalCaptureId}</p> : null}
          <div className="mt-6 text-left">
            <Progress percent={stats.percent} />
            <p className="mt-2 text-sm text-ink-soft">
              {money(stats.raisedCents, col.currency)} of {money(col.targetCents, col.currency)} · {stats.paidCount} contributions
            </p>
          </div>
          <Link href={`/c/${col.code}`} className="btn btn-ghost mt-8">Back to the collection</Link>
        </div>
      </main>
    </div>
  );
}
