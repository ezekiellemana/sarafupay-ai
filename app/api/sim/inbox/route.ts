import { NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb, schema } from "@/lib/db";

export async function GET(req: Request) {
  if (!env.simulatorEnabled()) return new Response("simulator disabled", { status: 404 });
  const p = new URL(req.url).searchParams;
  const digits = (p.get("phone") ?? "").replace(/[^0-9]/g, "");
  const after = Number(p.get("after") ?? 0) || 0;
  if (digits.length < 6) return NextResponse.json({ messages: [] });
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.chatLog)
    .where(and(eq(schema.chatLog.phone, `sim:${digits}`), gt(schema.chatLog.id, after)))
    .orderBy(asc(schema.chatLog.id))
    .limit(200);
  return NextResponse.json({
    messages: rows.map((r) => ({ id: r.id, direction: r.direction, text: r.text, at: r.createdAt })),
  });
}
