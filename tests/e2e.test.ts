/**
 * End-to-end flow test with a scripted mock LLM, in-memory Postgres (PGlite)
 * and a stubbed PayPal REST API. Run: npm test
 */
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";

process.env.PGLITE_DIR = "memory";
process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_SECRET = "test-secret";
process.env.APP_URL = "https://sarafupay.test";
process.env.WHATSAPP_ACCESS_TOKEN = "test-wa";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123";

type Step = { tool?: [string, Record<string, unknown>]; text?: string };
const script: Step[] = [];
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const model = new MockLanguageModelV4({
  doGenerate: async () => {
    const step = script.shift() ?? { text: "ok" };
    if (step.tool) {
      return {
        content: [{ type: "tool-call", toolCallId: `call_${Math.random()}`, toolName: step.tool[0], input: JSON.stringify(step.tool[1]) }],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      };
    }
    return { content: [{ type: "text", text: step.text ?? "" }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] };
  },
});

// --- PayPal REST stub (OAuth + Payouts) ---
const realFetch = globalThis.fetch;
const payoutCalls: unknown[] = [];
let templateApproved = false; // flips mid-test to simulate Meta approving the reminder template
const templateCalls: { to: string; template: { name: string; language: { code: string }; components: { type: string; parameters: { text: string }[] }[] } }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("api-m.sandbox.paypal.com")) {
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
    if (url.endsWith("/v1/payments/payouts") && init?.method === "POST") {
      payoutCalls.push(JSON.parse(String(init.body)));
      return Response.json({ batch_header: { payout_batch_id: "BATCH1", batch_status: "PENDING" } }, { status: 201 });
    }
    if (url.includes("/v1/payments/payouts/BATCH1"))
      return Response.json({ batch_header: { payout_batch_id: "BATCH1", batch_status: "SUCCESS" }, items: [{ payout_item_id: "ITEM1", transaction_status: "SUCCESS" }] });
    throw new Error(`unexpected PayPal call ${url}`);
  }
  if (url.includes("graph.facebook.com")) {
    const msg = init?.body ? JSON.parse(String(init.body)) : {};
    if (msg.type === "template") {
      templateCalls.push(msg);
      return templateApproved
        ? Response.json({ messages: [{ id: "wamid.T1" }] })
        : Response.json({ error: { code: 132001, message: "Template name does not exist in the translation" } }, { status: 404 });
    }
    // Simulate Meta refusing free-form text outside the 24h customer-service window.
    return Response.json({ error: { code: 131047, message: "Re-engagement message" } }, { status: 400 });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const { handleIncoming, __setModelForTests } = await import("../lib/agent/engine");
  const core = await import("../lib/services/core");
  const { getDb, schema } = await import("../lib/db");
  const { eq, asc } = await import("drizzle-orm");
  __setModelForTests(model);
  const db = await getDb();
  const inbox = async (phone: string) =>
    (await db.select().from(schema.chatLog).where(eq(schema.chatLog.phone, phone)).orderBy(asc(schema.chatLog.id)))
      .filter((r) => r.direction === "out")
      .map((r) => r.text);
  const say = (phone: string, text: string) => handleIncoming({ phone, channel: "sim", text });

  const OWNER = "sim:255700000101";
  const AMINA = "sim:255700000202";
  const JOHN = "sim:447700900303";

  // 1. Owner onboarding in chat
  script.push({ tool: ["update_my_profile", { name: "Enzo" }] }, { text: "Karibu Enzo!" });
  await say(OWNER, "Hi, I'm Enzo");
  script.push(
    { tool: ["create_collection", { title: "Neema Wedding", purpose: "Help Neema & Baraka", category: "wedding", target_amount: 500, currency: "USD", deadline: "2026-12-20" }] },
    { text: "Your collection is live!" },
  );
  await say(OWNER, "Create a collection for Neema's wedding, $500 by 20 Dec");
  const [col] = await db.select().from(schema.collections);
  assert.ok(col, "collection created");
  assert.match(col.code, /^NEEMAWED\d\d$/);
  console.log("✓ collection created", col.code);

  // 1b. Language: share-card commands carry the organiser's language for +255 newcomers
  const { langOf } = await import("../lib/i18n");
  const { logInbound } = await import("../lib/channels/messaging");
  await logInbound("255700000505", "Contribute NEEMAWED11");
  assert.equal(await langOf("255700000505"), "en", "English share card -> English for a +255 newcomer");
  await logInbound("255700000606", "Changia NEEMAWED11");
  assert.equal(await langOf("255700000606"), "sw", "Swahili share card -> Swahili");
  await logInbound("255700000505", "Habari, nataka kuchangia");
  assert.equal(await langOf("255700000505"), "sw", "a real Swahili message overrides the card hint");
  assert.ok((await import("../lib/services/links")).shareMessage(col, "Enzo", "sw").includes("Changia%20"), "Swahili card pre-fills Changia");
  console.log("✓ language follows the share card, then the user's own words");

  // 1c. Simulator sessions are private: same persona, different browsers -> different phones
  const { personaPhone, isPersona } = await import("../lib/sim");
  const a = personaPhone("a".repeat(32), "organiser");
  assert.equal(a, personaPhone("a".repeat(32), "organiser"), "stable within a session");
  assert.notEqual(a, personaPhone("b".repeat(32), "organiser"), "different between sessions");
  assert.match(a, /^2557\d{8}$/);
  assert.match(personaPhone("a".repeat(32), "john"), /^4477\d{8}$/);
  assert.ok(isPersona("p-ab12cd") && !isPersona("../x") && !isPersona("255700000101; drop"), "persona ids are validated");
  console.log("✓ simulator sessions get private, stable test numbers");

  // 2. Contributor: open + payment link
  script.push({ tool: ["open_collection", { code: col.code }] }, { tool: ["create_payment_link", { code: col.code, amount: 40, display_name: "Amina" }] }, { text: "Here is your link" });
  await say(AMINA, `Habari, nataka kuchangia ${col.code}`);
  const [ctb] = await db.select().from(schema.contributions);
  assert.equal(ctb.amountCents, 4000);
  assert.equal(ctb.status, "pending");
  console.log("✓ payment link created", ctb.id);

  // 3. PayPal capture -> receipts
  await core.applyCapture("ORDER1", "COMPLETED", "CAPTURE1", ctb.id, "amina@example.com");
  await core.applyCapture("ORDER1", "COMPLETED", "CAPTURE1", ctb.id, "amina@example.com"); // idempotent
  const aminaMsgs = await inbox(AMINA);
  assert.equal(aminaMsgs.filter((m) => /Payment received|Malipo yamepokelewa/.test(m)).length, 1, "exactly one receipt");
  const ownerMsgs = await inbox(OWNER);
  assert.ok(ownerMsgs.some((m) => m.includes("Amina") && m.includes("$40.00")), "owner alerted");
  assert.ok(aminaMsgs.some((m) => m.includes("Malipo yamepokelewa")), "Tanzanian contributor gets a Swahili receipt");
  console.log("✓ capture settled once, receipt + owner alert sent");

  // 3b. Public supporters list: first names only, email search is exact-match only
  const byName = await core.searchSupporters(col.id, { q: "ami" });
  assert.deepEqual(byName.items.map((s) => s.name), ["Amina"]);
  assert.equal((await core.searchSupporters(col.id, { q: "AMINA@example.com" })).total, 1, "exact email finds own contribution");
  assert.equal((await core.searchSupporters(col.id, { q: "amina@exam" })).total, 0, "partial email never matches");
  assert.equal((await core.searchSupporters(col.id, { q: "%" })).total, 0, "LIKE wildcards are escaped");
  assert.ok(!JSON.stringify(byName).includes("@"), "no emails leave the server");
  console.log("✓ supporters search: names, exact email only, no leaks");

  // 4. Pledge by John, owner reminds
  await db.update(schema.users).set({ name: "John" }).where(eq(schema.users.phone, JOHN));
  script.push({ tool: ["update_my_profile", { name: "John" }] }, { tool: ["make_pledge", { code: col.code, amount: 25, due_date: "2026-11-30" }] }, { text: "Pledge saved" });
  await say(JOHN, `I'll give $25 to ${col.code} by end of November`);
  script.push({ tool: ["remind_pledgers", { code: col.code }] }, { text: "Reminded John" });
  await say(OWNER, "remind people who haven't paid");
  assert.ok((await inbox(JOHN)).some((m) => m.includes("friendly reminder") && m.includes("/pay/ctb_")), "John reminded with link");
  console.log("✓ pledge + reminder with pay link");

  // 4b. Reminder WhatsApp refuses (24h window) -> not marked reminded, link returned to organiser
  const GRACE = "255700000404"; // real WhatsApp number (not sim)
  const grace = await core.getOrCreateUser(GRACE, "whatsapp", "Grace");
  await core.createPledge({ collection: col, user: grace, displayName: "Grace", amountCents: 1500, dueDate: "2026-12-01" });
  const r = await core.remindPledgers(col);
  assert.ok(r.unreachable.some((u) => u.name === "Grace" && u.pay_link.includes("/pay/ctb_")), "Grace reported unreachable with link");
  assert.ok(!r.reminded.includes("Grace"), "Grace not counted as reminded");
  const [gp] = await db.select().from(schema.pledges).where(eq(schema.pledges.userId, grace.id));
  assert.equal(gp.remindedAt, null, "remindedAt stays empty when WhatsApp refused");
  console.log("✓ refused WhatsApp reminder is not marked as sent; organiser gets the pay link");

  // 4c. Once the reminder template is approved, people outside the 24h window still get reminded
  templateApproved = true;
  const r2 = await core.remindPledgers(col);
  assert.ok(r2.reminded.includes("Grace") && !r2.unreachable.some((u) => u.name === "Grace"), "Grace reminded via template");
  const tc = templateCalls.at(-1)!;
  assert.equal(tc.to, GRACE);
  assert.equal(tc.template.name, "pledge_reminder");
  assert.deepEqual(tc.template.components[0].parameters.map((p) => p.text), ["Grace", "$15.00", col.title, "2026-12-01"]);
  assert.match(tc.template.components[1].parameters[0].text, /^ctb_/, "pay button carries the contribution id");
  const [gp2] = await db.select().from(schema.pledges).where(eq(schema.pledges.userId, grace.id));
  assert.ok(gp2.remindedAt, "remindedAt set once the template is delivered");
  console.log("✓ outside 24h: approved template delivers the reminder with a PayPal pay button");

  // 5. Non-owner cannot pay out
  script.push({ tool: ["prepare_payout", { code: col.code, recipient_email: "x@example.com", amount: 10, purpose: "test" }] }, { text: "Sorry" });
  await say(JOHN, "pay me $10");
  assert.equal((await db.select().from(schema.payouts)).length, 0, "no payout for non-owner");
  console.log("✓ non-owner payout blocked");

  // 6. Owner over-balance payout blocked
  script.push({ tool: ["prepare_payout", { code: col.code, recipient_email: "caterer@example.com", amount: 100, purpose: "catering" }] }, { text: "Insufficient" });
  await say(OWNER, "pay caterer $100");
  assert.equal((await db.select().from(schema.payouts)).length, 0, "no payout above balance");
  console.log("✓ over-balance payout blocked");

  // 7. Owner payout with CONFIRM code
  script.push({ tool: ["prepare_payout", { code: col.code, recipient_email: "caterer@example.com", recipient_name: "Mama Lishe Catering", amount: 30, purpose: "catering deposit" }] }, { text: "Sent you the confirmation" });
  await say(OWNER, "pay Mama Lishe $30 for the catering deposit, caterer@example.com");
  const [pending] = await db.select().from(schema.payouts);
  assert.equal(pending.status, "awaiting_confirmation");
  assert.ok((await inbox(OWNER)).some((m) => m.includes(`CONFIRM ${pending.confirmCode}`)));
  await say(OWNER, "CONFIRM 000000"); // wrong code
  assert.equal(payoutCalls.length, 0);
  await say(OWNER, `CONFIRM ${pending.confirmCode}`);
  assert.equal(payoutCalls.length, 1, "PayPal payout called once");
  await say(OWNER, `CONFIRM ${pending.confirmCode}`); // replay
  assert.equal(payoutCalls.length, 1, "no double payout");
  const done = await core.refreshPayout(pending.id);
  assert.equal(done?.status, "success");
  assert.ok((await inbox(AMINA)).some((m) => /Transparency update|Taarifa ya uwazi/.test(m) && m.includes("Mama Lishe")), "contributors notified");
  const stats = await core.collectionStats(col);
  assert.equal(stats.availableCents, 1000);
  console.log("✓ payout confirmed by code, executed once, transparency broadcast; balance", stats.availableCents / 100);

  // 8. Non-owner report = totals only
  const { buildTools } = await import("../lib/agent/tools");
  const john = (await db.select().from(schema.users).where(eq(schema.users.phone, JOHN)))[0];
  const rep = (await (buildTools({ user: john, channel: "sim" }).collection_report as { execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>> }).execute({ code: col.code }, {})) as Record<string, unknown>;
  assert.ok(!("contributions" in rep), "no names for non-owner");
  console.log("✓ privacy: non-owner sees totals only");

  console.log("\nAll e2e checks passed ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
