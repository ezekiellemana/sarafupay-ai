"use server";
import { redirect } from "next/navigation";
import { createContribution, findCollection } from "@/lib/services/core";
import { toCents } from "@/lib/format";

export async function contributeAction(code: string, form: FormData) {
  const col = await findCollection(code);
  if (!col) redirect("/");
  const name = String(form.get("name") ?? "").trim() || "Anonymous";
  const message = String(form.get("message") ?? "").trim();
  let cents: number;
  try {
    cents = toCents(String(form.get("amount") ?? ""));
    if (cents > 100_000_000) throw new Error("too large");
  } catch {
    redirect(`/c/${col.code}?err=amount`);
  }
  let id: string;
  try {
    const ctb = await createContribution({ collection: col, displayName: name, amountCents: cents, source: "web", message });
    id = ctb.id;
  } catch (e) {
    redirect(`/c/${col.code}?err=${encodeURIComponent(e instanceof Error ? e.message : "error")}`);
  }
  redirect(`/pay/${id}`);
}
