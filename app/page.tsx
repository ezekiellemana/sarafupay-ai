import Link from "next/link";
import { connection } from "next/server";
import { Logo, SandboxBadge } from "@/components/brand";
import { waLink } from "@/lib/channels/whatsapp";

const demo: { from: "me" | "bot"; text: string }[] = [
  { from: "me", text: "Habari! I want to collect money for my sister Neema's wedding 💍" },
  { from: "bot", text: "Hongera! 🎉 What's your name, and how much are you hoping to raise?" },
  { from: "me", text: "Enzo. $1,500 by 20 December" },
  { from: "bot", text: "Done ✅ Your collection *NEEMA24* is live.\nForward this to your groups 👇" },
  { from: "bot", text: "💰 *Amina* contributed $40 to NEEMA24\n▓▓▓░░░░░░░ 31% · $460 of $1,500" },
  { from: "me", text: "Pay the caterer $300 — mama.lishe@example.com" },
  { from: "bot", text: "🔐 Reply *CONFIRM 482913* to send $300 with PayPal." },
];

const steps = [
  {
    n: "01",
    title: "Start in a chat",
    body: "Tell the SarafuPay agent what you're collecting for. It asks a few questions and creates the collection on the spot. No forms, no app to install.",
  },
  {
    n: "02",
    title: "Share one message",
    body: "Forward the invitation to your WhatsApp groups. Friends tap it, tell the bot how much, and pay securely with PayPal. Receipts are automatic.",
  },
  {
    n: "03",
    title: "Spend in the open",
    body: "Ask “who hasn't paid?”, nudge pledgers, and pay vendors from the pot. Every payout needs your one-time code and is reported to every contributor.",
  },
];

export default async function Home() {
  await connection();
  const wa = waLink("Hi SarafuPay 👋");
  return (
    <div className="flex min-h-screen flex-col">
      <div className="kanga" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-5 text-sm font-medium text-ink-soft">
          <a href="#how" className="hidden sm:inline hover:text-ink">How it works</a>
          <a href="#trust" className="hidden sm:inline hover:text-ink">Transparency</a>
          <Link href="/chat" className="btn btn-primary !py-2 !px-4 text-sm">Try it</Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-16 pt-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section>
          <div className="rise"><SandboxBadge /></div>
          <h1 className="rise d1 font-display mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl">
            Michango,<br />
            <span className="italic text-forest-2">without</span> the<br />
            notebook.
          </h1>
          <p className="rise d2 mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            SarafuPay is an AI agent that lives in WhatsApp. It runs group collections for weddings, funerals, medical bills,
            school fees and NGOs. It collects with <strong className="text-ink">PayPal</strong> and pays out in the open, so
            everyone who gave can see where the money went.
          </p>
          <div className="rise d3 mt-8 flex flex-wrap gap-3">
            <Link href="/chat" className="btn btn-primary">Open the chat simulator →</Link>
            {wa ? (
              <a href={wa} className="btn btn-ghost" target="_blank" rel="noreferrer">Message us on WhatsApp</a>
            ) : null}
          </div>
          <dl className="rise d4 mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ["0", "apps to install"],
              ["1", "message to share"],
              ["100%", "payouts reported"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="font-display text-3xl font-semibold">{k}</dt>
                <dd className="text-sm text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Example conversation" className="rise d3 relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-4 -rotate-3 rounded-[2.5rem] bg-marigold/30" aria-hidden />
          <div className="relative overflow-hidden rounded-[2.2rem] border-[10px] border-ink bg-[var(--chat-bg)] shadow-2xl">
            <div className="flex items-center gap-3 bg-forest px-4 py-3 text-paper">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-marigold font-display font-bold text-ink">S</div>
              <div>
                <p className="text-sm font-semibold">SarafuPay</p>
                <p className="text-[11px] opacity-75">AI agent · online</p>
              </div>
            </div>
            <div className="space-y-2 px-3 py-4 text-[13px] leading-snug">
              {demo.map((m, i) => (
                <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <p
                    className="bubble max-w-[82%] whitespace-pre-line rounded-2xl px-3 py-2 shadow-sm"
                    style={{
                      background: m.from === "me" ? "var(--bubble-out)" : "var(--bubble-in)",
                      animationDelay: `${0.5 + i * 0.35}s`,
                    }}
                  >
                    {m.text.split(/(\*[^*]+\*)/).map((part, j) =>
                      part.startsWith("*") ? <strong key={j}>{part.slice(1, -1)}</strong> : <span key={j}>{part}</span>,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <section id="how" className="bg-forest text-paper">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-4xl font-semibold sm:text-5xl">How it works</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((s) => (
              <article key={s.n} className="border-t border-paper/25 pt-6">
                <p className="font-mono text-sm text-marigold">{s.n}</p>
                <h3 className="font-display mt-2 text-2xl font-semibold">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-paper/80">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl font-semibold">Built for trust</h2>
          <p className="mt-4 text-ink-soft leading-relaxed">
            In a WhatsApp collection, trust is the whole product. SarafuPay keeps the AI helpful, and keeps the money
            moves deterministic.
          </p>
        </div>
        <ul className="space-y-5">
          {[
            ["The AI can't move money on its own", "Payouts run only after the owner types a one-time CONFIRM code. That step never goes through the language model."],
            ["Every payout is broadcast", "Contributors get a transparency update with the recipient, the purpose and the PayPal reference."],
            ["Privacy by role", "Only the organiser sees who gave what. Everyone else sees totals and the payout ledger."],
            ["Voice notes & Swahili", "Speak or type in your language. The agent replies in it."],
          ].map(([t, b]) => (
            <li key={t} className="ledger-row pb-5">
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-ink-soft">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-soft">
          <Logo />
          <p>
            PayPal Orders · Payouts · Invoicing via Agent Toolkit · Gemini · AG Studio · Render. Built for the PayPal AI
            Hackathon 2026. ·{" "}
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
