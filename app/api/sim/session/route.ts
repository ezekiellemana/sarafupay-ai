import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { simSession, sweepOldSimChats } from "@/lib/sim";

/** Starts (or, with ?reset=1, restarts) this browser's private simulator session. */
export async function POST(req: Request) {
  if (!env.simulatorEnabled()) return new Response("simulator disabled", { status: 404 });
  const reset = new URL(req.url).searchParams.get("reset") === "1";
  await simSession({ create: true, rotate: reset });
  void sweepOldSimChats();
  return NextResponse.json({ ok: true });
}
