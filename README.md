# SarafuPay: group collections on WhatsApp, powered by PayPal + AI

> **Michango, without the notebook.** An AI agent inside WhatsApp that runs group collections for weddings, funerals, medical bills, school fees, NGOs and community groups. It collects with **PayPal** and pays out in the open.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com). Everything runs on the **PayPal sandbox** (test money).

## The problem

Across East Africa (and the diaspora), money for life events is collected in WhatsApp groups. One person collects by hand, keeps a list in a notebook, chases pledges one by one, and posts screenshots to prove what came in and where it went. That takes a lot of time, it's error-prone, and trust is fragile.

## What SarafuPay does

| Who | In chat | Behind the scenes |
|---|---|---|
| **Organiser** | "I want to collect $1,500 for my sister's wedding by 20 Dec" | AI onboards them in chat (name, goal, deadline) and creates the collection code + a forwardable invite |
| **Friends** | Tap the invite → "Contribute NEEMA24" → "$40" | AI creates a **PayPal order** and sends a pay link; receipt + organiser alert after capture |
| **Pledgers** | "I'll pay $25 on Friday" | Pledge recorded; organiser can send **WhatsApp reminders** or a **PayPal invoice + QR** (Agent Toolkit) |
| **Organiser** | "Who hasn't paid?" / "How much do we have?" | AI answers from live data |
| **Organiser** | "Pay Mama Lishe $300 for catering" | AI prepares a **PayPal Payout**; money moves **only** when the organiser replies `CONFIRM <6-digit code>` (never via the LLM) |
| **Everyone** | – | Every payout is broadcast to contributors as a **transparency update** and listed on the public page |
| **Treasurer** | Private dashboard | **AG Studio** dashboard + a custom **Treasurer agent** that delegates to Studio's built-in agents |

Voice notes and Swahili work too: the agent replies in the user's language.

## Architecture

```
WhatsApp (Meta Cloud API) ─┐                     ┌─ PayPal Orders v2 (server SDK)   collect
Web chat simulator (/chat) ┼─► Agent engine ─────┼─ PayPal Payouts v1 (REST)         disburse
Public page (/c/CODE) ─────┘   Gemini via        ├─ PayPal Agent Toolkit             invoices, QR, order lookups
                               Vercel AI SDK v7  ├─ PayPal Webhooks (verified)        settle captures / payouts / invoices
                               + guarded tools   └─ Postgres (Render) / PGlite (local)
Treasurer dashboard (/d/CODE) ─► AG Studio + Studio Agent Framework ─► /api/studio/llm (Gemini proxy)
```

- `lib/agent/`: system prompt, guarded domain tools, the engine (per-user queue, chat memory, voice notes). `CONFIRM`/`CANCEL` codes are handled before the LLM.
- `lib/paypal/`: Orders via `@paypal/paypal-server-sdk` (APIMatic-generated), Payouts + webhook verification via REST, and **Agent Toolkit** tools re-wrapped for AI SDK v7.
- `lib/services/core.ts`: collections, contributions (idempotent capture), pledges, payouts and the transparency broadcast.
- `app/d/[code]`: AG Studio with branded theme, initial report, custom `Treasurer` agent + custom tools (`collection_summary`, `remind_pledgers`) and AG's five built-in agents, all running on Gemini through a custom `AgLlmAdapter`.

### Safety by design

- The LLM can **prepare** a payout but cannot execute one. Execution requires the owner's own number to send a one-time code (15-minute expiry, single use, balance re-checked, PayPal idempotency key).
- Role-based privacy: only the organiser sees contributor names; others see totals and the payout ledger.
- PayPal and Meta webhooks are signature-verified. The Agent Toolkit is pinned to `sandbox: true`.

## Run it locally (5 minutes)

Requires Node 20.9+.

```bash
npm install
cp env.example .env.local     # fill PAYPAL_CLIENT_ID/PAYPAL_SECRET (sandbox) + GEMINI_API_KEY
npm run seed                  # optional: demo collection with contributions, pledges and a payout
npm run dev                   # http://localhost:3000  → open /chat
npm test                      # end-to-end flow test (mock LLM, in-memory Postgres, stubbed PayPal)
```

No database setup is needed locally: without `DATABASE_URL` the app uses embedded Postgres (PGlite) in `./.data`.

### Keys you need

| Service | Where | Env |
|---|---|---|
| PayPal sandbox app | developer.paypal.com → Apps & Credentials (Sandbox) | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` |
| PayPal webhook | Same app → Webhooks → `https://<app>/api/paypal/webhook`, events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.*`, `INVOICING.INVOICE.PAID` | `PAYPAL_WEBHOOK_ID` |
| Gemini | aistudio.google.com/apikey (free tier) | `GEMINI_API_KEY` |
| WhatsApp Cloud API | developers.facebook.com → WhatsApp → API Setup; webhook `https://<app>/api/whatsapp`, field `messages` | `WHATSAPP_*` |
| AG Studio (optional) | Trial key from AG Grid (removes watermark) | `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` |

## Deploy on Render

`render.yaml` provisions the web service + Postgres. **New → Blueprint** → pick this repo → fill the `sync: false` secrets → set `APP_URL` to the service URL → point the PayPal and Meta webhooks at it. `/api/health` reports which integrations are configured.

## For judges: how to test

1. Open **`/chat`** (WhatsApp simulator: same agent, same PayPal sandbox as WhatsApp).
2. As **Organiser**: "Hi, I want to start a collection for my sister's wedding, $500".
3. Switch to **Friend · Amina** → "Contribute CODE" → "$20" → open the link → pay with a PayPal sandbox **personal** account.
4. Back as Organiser: see the alert, ask "who has paid?", then "pay caterer@example.com $10 for the deposit" and reply with the `CONFIRM` code.
5. Ask for the dashboard link to open the AG Studio treasurer dashboard.

## Built with

PayPal Orders v2 · PayPal Payouts · PayPal Invoicing & Orders via **PayPal Agent Toolkit** · PayPal Webhooks · `@paypal/paypal-server-sdk` · Google Gemini · Vercel AI SDK · **AG Studio** (Studio Agent Framework) · Next.js 16 · Drizzle ORM · Postgres / PGlite · WhatsApp Cloud API · **Render**. Started from PayPal's official `hackathon-paypal-ag-grid-boilerplate`.

## Roadmap

Mobile money (M-Pesa, Airtel Money) collection and payouts · recurring contributions (vikoba/chama) · multi-organiser approvals for NGOs.

## License

MIT, see [LICENSE](LICENSE).
