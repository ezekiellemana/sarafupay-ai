/**
 * Seeds a realistic demo collection (no PayPal calls) for local UI work and the demo video.
 * Run: npm run seed   (uses DATABASE_URL if set, else local PGlite)
 */
import * as core from "../lib/services/core";
import { getDb, schema } from "../lib/db";
import { eq } from "drizzle-orm";
import { dashboardUrl, collectionUrl } from "../lib/services/links";

async function main() {
  const db = await getDb();
  const owner = await core.getOrCreateUser("sim:255700000101", "sim");
  await core.updateUser(owner.id, { name: "Enzo" });
  const col = await core.createCollection({
    ownerId: owner.id,
    title: "Neema & Baraka's Wedding",
    purpose: "Help us give Neema and Baraka a beautiful send-off: venue, catering and the choir. Every contribution counts. Asanteni!",
    category: "wedding",
    targetCents: 150000,
    currency: "USD",
    deadline: "2026-12-20",
  });
  const people = [
    ["Amina", 4000, "chat"], ["John", 2500, "web"], ["Fatuma", 10000, "chat"], ["Baraka's uncle", 20000, "chat"],
    ["Grace", 1500, "web"], ["Juma", 5000, "chat"], ["Mary (London)", 7500, "web"], ["Peter", 3000, "chat"],
    ["Halima", 6000, "chat"], ["Kelvin", 2000, "web"], ["Rehema", 12000, "chat"], ["Daudi", 4500, "chat"],
  ] as const;
  let day = 0;
  for (const [name, cents, ch] of people) {
    const u = await core.getOrCreateUser(`sim:2557${String(10000000 + day * 7919)}`, "sim");
    await core.updateUser(u.id, { name });
    const c = await core.createContribution({ collection: col, contributorId: u.id, displayName: name, amountCents: cents, source: ch === "web" ? "web" : "sim" });
    const paidAt = new Date(Date.now() - (12 - day) * 86400000 * 1.5);
    await db.update(schema.contributions).set({ status: "paid", paidAt, paypalCaptureId: `DEMO${String(day).padStart(4, "0")}CAPTURE` }).where(eq(schema.contributions.id, c.id));
    day++;
  }
  for (const [name, cents, due] of [["Selemani", 5000, "2026-11-30"], ["Agnes", 3000, "2026-12-05"], ["Musa", 10000, "2026-12-10"]] as const) {
    const u = await core.getOrCreateUser(`sim:2556${String(20000000 + cents)}`, "sim");
    await core.updateUser(u.id, { name });
    await core.createPledge({ collection: col, user: u, displayName: name, amountCents: cents, dueDate: due });
  }
  const p = await core.proposePayout({ collection: col, requester: owner, recipientEmail: "mama.lishe@example.com", recipientName: "Mama Lishe Catering", amountCents: 30000, note: "catering deposit" });
  await db.update(schema.payouts).set({ status: "success", executedAt: new Date(), paypalBatchId: "DEMOBATCH", paypalItemId: "DEMOITEM" }).where(eq(schema.payouts.id, p.id));
  const fresh = (await core.findCollection(col.code))!;
  console.log("Seeded", col.code);
  console.log("Public:", collectionUrl(col.code));
  console.log("Dashboard:", dashboardUrl(fresh));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
