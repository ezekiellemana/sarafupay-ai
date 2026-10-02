# Devpost submission draft

**Name:** SarafuPay. Group collections on WhatsApp, powered by PayPal + AI
**Tagline:** An AI agent in WhatsApp that collects for weddings, funerals and medical bills with PayPal, and pays out in the open.

## Inspiration
Michango (group contributions) fund life's biggest moments across East Africa and the diaspora, entirely inside WhatsApp groups. The organiser keeps a notebook, chases pledges, and posts screenshots to prove where money went.

## What it does
- Organisers create a collection by chatting (no forms, no app).
- Friends contribute from a forwarded message → PayPal checkout → automatic receipts.
- Pledges, reminders and PayPal invoices with QR codes (Agent Toolkit).
- "Who hasn't paid?" answered from live data.
- Payouts to vendors via PayPal Payouts, only after the organiser types a one-time CONFIRM code, then broadcast to every contributor.
- Treasurer dashboard on AG Studio with a custom Treasurer agent delegating to Studio's built-in agents.
- Swahili/English, voice notes.

## How we built it
Next.js 16 (from PayPal's AG Grid hackathon boilerplate) on Render · PayPal Orders v2 via `@paypal/paypal-server-sdk` · PayPal Payouts + webhooks via REST · PayPal Agent Toolkit tools (create/send invoice, reminders, QR, get order) wrapped for Vercel AI SDK v7 · Gemini · WhatsApp Cloud API · AG Studio Agent Framework with a custom Gemini `AgLlmAdapter` · Postgres (Drizzle) · end-to-end tests with a mock LLM.

## Challenges
- Keeping an LLM away from money movement: payouts are a deterministic path keyed by a one-time code from the owner's own number.
- The Agent Toolkit targets AI SDK v4 and defaults to production; we re-wrapped its tools for v7 and pinned sandbox.
- WhatsApp bots can't join ordinary groups via the Cloud API, so we designed around forwardable invites + wa.me deep links.

## What's next
M-Pesa / Airtel Money rails, recurring chama/vikoba contributions, multi-signer approvals for NGOs.

## Built with
paypal, paypal-agent-toolkit, paypal-payouts, gemini, vercel-ai-sdk, ag-grid, ag-studio, nextjs, typescript, postgresql, drizzle, whatsapp-cloud-api, render
