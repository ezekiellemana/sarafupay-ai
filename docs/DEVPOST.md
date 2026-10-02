# Devpost submission

**Project name:** SarafuPay

**Elevator pitch (≤200 chars):** An AI agent inside WhatsApp that runs group collections for weddings, funerals and hospital bills with PayPal, and shows everyone where every dollar went.

**Links**
- Live app: https://sarafupay-ai.onrender.com
- Simulator for judges: https://sarafupay-ai.onrender.com/chat
- WhatsApp: https://wa.me/255650972587
- Code: https://github.com/ezekiellemana/sarafupay-ai (MIT)

---

## Inspiration
In Tanzania and across East Africa, *michango* (group contributions) pay for life's biggest moments: weddings, funerals, hospital bills, school fees. It all happens in WhatsApp groups. One trusted person collects money by hand, keeps a notebook, chases pledges one by one, and posts screenshots to prove where the money went. It's exhausting for the organiser, and when the numbers don't add up, friendships suffer. We wanted to keep the place people already gather, WhatsApp, and take away the notebook.

## What it does
SarafuPay is an AI agent you chat with on WhatsApp, in Swahili or English.
- **Organisers create a collection by chatting.** No forms, no app: "Nataka kuchangisha $500 kwa harusi ya dada yangu." The agent asks for anything missing and returns a share card to forward into the family group.
- **Friends contribute with PayPal.** "Contribute NEEMA24" → "$40" → a PayPal checkout link. After capture, the friend gets a receipt and the organiser an alert.
- **Pledges and reminders.** "I'll pay $25 on Friday" is recorded; the organiser can send friendly reminders or a PayPal invoice with QR code (PayPal Agent Toolkit).
- **Answers from live data.** "Who hasn't paid?", "How much do we have?", "Send me a report".
- **Payouts with a human in the loop.** "Pay Mama Lishe $300 for catering" prepares a PayPal Payout, but money moves only when the organiser replies with a one-time `CONFIRM` code from their own number.
- **Radical transparency.** Every payout is broadcast to all contributors and listed on a public collection page.
- **Treasurer dashboard.** An AG Studio dashboard with a custom Treasurer agent that delegates to Studio's built-in agents.

## How we built it
- **Next.js 16** on **Render** (web service + Postgres), started from PayPal's AG Grid hackathon boilerplate.
- **PayPal Orders v2** through `@paypal/paypal-server-sdk` for collecting; **PayPal Payouts** (REST) for disbursing; **PayPal Webhooks** (signature-verified) to settle captures, payouts and invoices.
- **PayPal Agent Toolkit** tools (create/send invoice, reminders, QR code, get order) re-wrapped for Vercel AI SDK v7 and pinned to sandbox.
- **Google Gemini** through the **Vercel AI SDK** with guarded domain tools and an automatic model fallback chain.
- **WhatsApp Cloud API** with signed webhooks and message-ID de-duplication; a web simulator at `/chat` runs the same agent for judges without a phone.
- **AG Studio** + Studio Agent Framework with a custom Gemini `AgLlmAdapter`.
- **Drizzle ORM** on Postgres (PGlite locally, so it runs with zero setup) and an end-to-end test that drives the full money flow with a scripted LLM and a stubbed PayPal API.

## Challenges we ran into
- **Keeping an LLM away from money.** We made payouts a deterministic path: the model can only prepare one; execution needs a single-use, time-limited code typed by the owner, with the balance re-checked and a PayPal idempotency key.
- **Toolkit compatibility.** The Agent Toolkit targets an older AI SDK and defaults to production, so we wrapped its tools for v7 and forced sandbox mode.
- **Real WhatsApp, real constraints.** Bots can't join normal groups, so we designed around forwardable share cards and `wa.me` links. Meta retries slow webhooks, which caused duplicate replies until we added de-duplication.
- **Language.** Users switch between Swahili and English mid-conversation. We detect the language per message and made every receipt, alert and update bilingual, using WhatsApp's own formatting.

## Accomplishments that we're proud of
- A full sandbox money loop running live on a real WhatsApp number: chat → PayPal order → capture → receipt → payout by confirmation code → transparency broadcast.
- An agent that feels local: Swahili-first for Tanzanian users, voice notes supported.
- Safety that doesn't depend on the model behaving.

## What we learned
Trust is the product. The AI makes collecting easier, but the feature that matters most is a clear, shared record of where the money went. We also learned how much careful engineering sits around an LLM when real payments are involved: idempotency, webhooks, retries and human confirmation.

## What's next for SarafuPay
- Mobile money (M-Pesa, Airtel Money) alongside PayPal for local contributors.
- Approved WhatsApp templates for reminders outside the 24-hour window.
- Recurring contributions for *vikoba* / *chama* savings groups, and multi-signer approvals for NGOs.

## Built with
paypal, paypal-agent-toolkit, paypal-payouts, paypal-server-sdk, gemini, vercel-ai-sdk, ag-grid, ag-studio, next.js, typescript, react, postgresql, drizzle, whatsapp-cloud-api, render
