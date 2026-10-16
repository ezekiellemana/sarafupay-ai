// Entry point for the Render Cron Job `sarafupay-reconcile` (render.yaml).
// Dependency-free on purpose: the cron container needs no build, it just asks the
// web service (which holds the PayPal/WhatsApp credentials) to run reconcile().
const base = (process.env.APP_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
if (!base || !secret) {
  console.error("APP_URL and CRON_SECRET are required");
  process.exit(1);
}

const res = await fetch(`${base}/api/cron/reconcile`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(110_000),
});
const text = await res.text();
console.log(`[cron] ${res.status} ${text}`);
// Non-zero exit marks the run as failed in the Render dashboard (and alerts, if enabled).
if (!res.ok) process.exit(1);
try {
  if (JSON.parse(text).ok === false) process.exit(1);
} catch {
  process.exit(1);
}
