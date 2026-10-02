import { NextResponse } from "next/server";
import { ownerCollection } from "@/lib/studio/auth";
import { collectionStats, remindPledgers } from "@/lib/services/core";
import { money } from "@/lib/format";

// Actions the dashboard's Treasurer agent can take. Payouts are deliberately NOT here:
// they stay in chat behind the owner's CONFIRM code.
export async function POST(req: Request) {
  const col = await ownerCollection(req.headers.get("x-collection"), req.headers.get("x-owner-key"));
  if (!col) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "remind_pledgers") {
    const r = await remindPledgers(col);
    return NextResponse.json({ ok: true, ...r });
  }
  if (action === "summary") {
    const s = await collectionStats(col);
    return NextResponse.json({
      ok: true,
      title: col.title,
      target: money(col.targetCents, col.currency),
      raised: money(s.raisedCents, col.currency),
      percent: s.percent,
      contributions: s.paidCount,
      paid_out: money(s.paidOutCents, col.currency),
      balance: money(s.availableCents, col.currency),
      open_pledges: `${s.openPledgeCount} (${money(s.openPledgeCents, col.currency)})`,
      deadline: col.deadline,
    });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
