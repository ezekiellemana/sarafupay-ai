import { NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { isPersona, personaPhone, simSession } from "@/lib/sim";

export async function GET(req: Request) {
  if (!env.simulatorEnabled()) return new Response("simulator disabled", { status: 404 });
  const sid = await simSession();
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const persona = p.get("persona");
  if (!isPersona(persona)) return NextResponse.json({ error: "persona required" }, { status: 400 });
  const after = Number(p.get("after") ?? 0) || 0;
  const phone = personaPhone(sid, persona);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.chatLog)
    .where(and(eq(schema.chatLog.phone, `sim:${phone}`), gt(schema.chatLog.id, after)))
    .orderBy(asc(schema.chatLog.id))
    .limit(200);
  return NextResponse.json(
    { phone, messages: rows.map((r) => ({ id: r.id, direction: r.direction, text: r.text, at: r.createdAt })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
