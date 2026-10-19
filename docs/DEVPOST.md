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
In Tanzania and across East Africa, *michango* (group contributions) pay for life's biggest moments: weddings, funerals, hospital bills, school fees. It all happens in WhatsApp groups. One trusted person collects money by hand, keeps a notebook, chases pledges one by one, and posts screenshots to prove where the money went. It's exhausting for the organiser, and when the numbers don't add up, friendships suffer. I wanted to keep the place people already gather, WhatsApp, and take away the notebook.

## What it does
SarafuPay is an AI agent you chat with on WhatsApp, in Swahili or English.
- **Organisers create a collection by chatting.** No forms, no app: "Nataka kuchangisha $500 kwa harusi ya dada yangu." The agent asks for anything missing and returns a share card to forward into the family group.
- **Friends contribute with PayPal.** "Contribute NEEMA24" → "$40" → a PayPal checkout link. After capture, the friend gets a receipt and the organiser an alert.
- **Or chip in on the web.** Every collection has a public page with one currency-aware amount field (live formatting, quick picks) that goes straight to PayPal checkout.
- **Pledges and reminders.** "I'll pay $25 on Friday" is recorded; the organiser can send friendly reminders or a PayPal invoice with QR code (PayPal Agent Toolkit). If WhatsApp refuses a reminder (outside its 24-hour window), the agent says so and hands the organiser that person's pay link to forward.
- **Answers from live data.** "Who hasn't paid?", "How much do we have?", "Send me a report".
- **Payouts with a human in the loop.** "Pay Mama Lishe $300 for catering" prepares a PayPal Payout, but money moves only when the organiser replies with a one-time `CONFIRM` code from their own number.
- **Radical transparency.** Every payout is broadcast to all contributors and listed on a public collection page, next to a searchable, paginated supporters list (first names and messages only).
- **Treasurer dashboard.** An AG Studio dashboard (KPIs, charts, contribution and payout ledgers) with a custom Treasurer agent that delegates to Studio's built-in agents.
- **Pledge scoreboard.** A custom AG Studio widget that shows pledges as a friendly scoreboard, not a debt list: promises kept, money still to come, who is past their date, and a "Send friendly nudges" button (with a confirm step) that sends each person a WhatsApp reminder with their own PayPal link. Clicking a person cross-filters the dashboard. It's in the widget menu, so organisers can add it to any page.

## How I built it
SarafuPay AI is a new build for this hackathon: the whole codebase was written during the submission period (first commit Oct 2, 2026).

- **Next.js 16** on **Render**, started from PayPal's AG Grid hackathon boilerplate. One Blueprint (`render.yaml`) defines four services: an always-on **Web Service**, **Postgres**, a private **Key Value** instance and a **Cron Job**.
- **PayPal Orders v2** through `@paypal/paypal-server-sdk` for collecting; **PayPal Payouts** (REST) for disbursing; **PayPal Webhooks** (signature-verified) to settle captures, payouts and invoices.
- **APIMatic:** collecting runs on the APIMatic-generated PayPal Server SDK, and I used the **APIMatic Context Plugin for PayPal** in Claude Code to audit that code. It caught a hidden no-timeout default, retries that could never fire and an over-broad error catch around capture; all fixed (docs/APIMATIC_CONTEXT_PLUGIN.md).
- **PayPal Agent Toolkit** tools (create/send invoice, reminders, QR code, get order) re-wrapped for Vercel AI SDK v7 and pinned to sandbox.
- **Google Gemini** through the **Vercel AI SDK** with guarded domain tools and an automatic model fallback chain.
- **WhatsApp Cloud API** with signed webhooks and message-ID de-duplication; a web simulator at `/chat` runs the same agent for judges without a phone. Each browser gets a **private session** (HttpOnly cookie, test numbers derived on the server), so many judges can test at once without seeing each other's chats.
- **Cost guard:** per-sender and daily AI limits, kept in Render Key Value so they survive deploys, with an in-memory fallback if Key Value is unreachable.
- **Self-healing payments:** a Render Cron Job runs every 15 minutes and re-checks pending PayPal orders. If a webhook was lost, it records the capture (or captures an approved order) through the same idempotent code as the webhook, finalises stuck payouts and prunes old de-dup rows.
- **AG Studio** + Studio Agent Framework with a custom Gemini `AgLlmAdapter`.
- **Drizzle ORM** on Postgres (PGlite locally, so it runs with zero setup) and an end-to-end test that drives the full money flow with a scripted LLM and a stubbed PayPal API.

## Challenges I ran into
- **Keeping an LLM away from money.** I made payouts a deterministic path: the model can only prepare one; execution needs a single-use, time-limited code typed by the owner, with the balance re-checked and a PayPal idempotency key.
- **Toolkit compatibility.** The Agent Toolkit targets an older AI SDK and defaults to production, so I wrapped its tools for v7 and forced sandbox mode.
- **Real WhatsApp, real constraints.** Bots can't join normal groups, so I designed around forwardable share cards and `wa.me` links. Meta retries slow webhooks, which caused duplicate replies until I added de-duplication.
- **Language.** Users switch between Swahili and English mid-conversation. The agent detects the language from their recent messages (and from which share card they tapped), and I made every receipt, alert and update bilingual, using WhatsApp's own formatting.
- **Webhooks can go missing.** A payment that PayPal captured but whose webhook never arrived would leave a contributor without a receipt. The reconcile cron job closes that gap without ever double-counting.
- **Privacy on a public page.** Showing supporters builds trust, but emails and amounts must stay private. The public list shows first names only, and email search matches only a full, exact address, so it can't be used to harvest emails.

## Accomplishments that I'm proud of
- A full sandbox money loop running live on a real WhatsApp number: chat → PayPal order → capture → receipt → payout by confirmation code → transparency broadcast.
- An agent that feels local: Swahili-first for Tanzanian users, voice notes supported.
- Safety that doesn't depend on the model behaving.
- A demo that's ready for many judges at once: private simulator sessions, cost limits, and an end-to-end test suite covering the money flow, privacy and session isolation.

## What I learned
Trust is the product. The AI makes collecting easier, but the feature that matters most is a clear, shared record of where the money went. I also learned how much careful engineering sits around an LLM when real payments are involved: idempotency, webhooks, retries and human confirmation.

## What's next for SarafuPay
- Mobile money (M-Pesa, Airtel Money) alongside PayPal for local contributors.
- Go live with the approved `pledge_reminder` WhatsApp template (already built and tested) so reminders reach people outside the 24-hour window.
- Recurring contributions for *vikoba* / *chama* savings groups, and multi-signer approvals for NGOs.

## Built with
paypal, paypal-agent-toolkit, paypal-payouts, paypal-server-sdk, gemini, vercel-ai-sdk, ag-grid, ag-studio, next.js, typescript, react, postgresql, drizzle, whatsapp-cloud-api, render, render-postgres, render-key-value, render-cron-jobs, redis, apimatic
