import { NextResponse } from "next/server";
import { env, paypalConfigured, whatsappConfigured } from "@/lib/env";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { aiUsageToday } from "@/lib/limits";

export async function GET() {
  let db = false;
  try {
    await (await getDb()).execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json(
    {
      ok: db,
      db,
      paypal: paypalConfigured(),
      gemini: Boolean(env.geminiApiKey()),
      whatsapp: whatsappConfigured(),
      simulator: env.simulatorEnabled(),
      ai_today: aiUsageToday(),
    },
    { status: db ? 200 : 503 },
  );
}
