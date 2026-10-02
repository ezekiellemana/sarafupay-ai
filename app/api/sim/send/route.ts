import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleIncoming } from "@/lib/agent/engine";

export async function POST(req: Request) {
  if (!env.simulatorEnabled()) return new Response("simulator disabled", { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { phone?: string; text?: string };
  const digits = String(body.phone ?? "").replace(/[^0-9]/g, "");
  const text = String(body.text ?? "").slice(0, 2000);
  if (digits.length < 6 || !text.trim()) return NextResponse.json({ error: "phone and text required" }, { status: 400 });
  await handleIncoming({ phone: `sim:${digits}`, channel: "sim", text });
  return NextResponse.json({ ok: true });
}
