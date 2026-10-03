import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleIncoming } from "@/lib/agent/engine";
import { clientIp, isPersona, personaPhone, simSession } from "@/lib/sim";
import { hit } from "@/lib/limits";

export async function POST(req: Request) {
  if (!env.simulatorEnabled()) return new Response("simulator disabled", { status: 404 });
  const sid = await simSession();
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { persona?: string; text?: string };
  const text = String(body.text ?? "").slice(0, 2000);
  if (!isPersona(body.persona) || !text.trim()) return NextResponse.json({ error: "persona and text required" }, { status: 400 });
  // Per-person limits live in the agent; this stops one visitor spinning up endless sessions.
  if (!hit(`sim-ip:${clientIp(req)}`, 60, 10 * 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  await handleIncoming({ phone: `sim:${personaPhone(sid, body.persona)}`, channel: "sim", text });
  return NextResponse.json({ ok: true });
}
