"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand";

type Msg = { id: number; direction: "in" | "out"; text: string; at: string; pending?: boolean };
type Identity = { label: string; phone: string };

const PRESETS: Identity[] = [
  { label: "Organiser", phone: "255700000101" },
  { label: "Friend · Amina", phone: "255700000202" },
  { label: "Friend · John (UK)", phone: "447700900303" },
];

const KEY = "sarafupay.sim.identities";
const ACTIVE = "sarafupay.sim.active";

function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Renders WhatsApp-style *bold*, _italic_ and clickable links. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+|\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all font-medium text-sky underline">
              {p}
            </a>
          );
        if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function Simulator({ buyer }: { buyer: { email: string; password: string } }) {
  const search = useSearchParams();
  const [ids, setIds] = useState<Identity[]>(PRESETS);
  const [active, setActive] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const lastId = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const me = ids[active] ?? PRESETS[0];

  useEffect(() => {
    // Hydrate from localStorage after mount (not available during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(load(KEY, PRESETS));
    setActive(load(ACTIVE, 0));
    const t = search.get("text");
    if (t) setDraft(t);
  }, [search]);

  const polling = useRef(false);
  const poll = useCallback(async () => {
    if (polling.current) return; // never overlap polls (slow AI replies caused duplicates)
    polling.current = true;
    try {
      const phone = me.phone;
      const res = await fetch(`/api/sim/inbox?phone=${phone}&after=${lastId.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const { messages } = (await res.json()) as { messages: Msg[] };
      if (!messages.length) return;
      lastId.current = Math.max(lastId.current, messages[messages.length - 1].id);
      setMsgs((prev) => {
        const seen = new Set(prev.filter((m) => !m.pending).map((m) => m.id));
        const fresh = messages.filter((m) => !seen.has(m.id));
        const hasIn = fresh.some((m) => m.direction === "in");
        return [...prev.filter((m) => !(m.pending && hasIn)), ...fresh];
      });
    } finally {
      polling.current = false;
    }
  }, [me.phone]);

  useEffect(() => {
    lastId.current = 0;
    // Switching identity resets the thread before polling the new inbox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsgs([]);
    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy) return;
    setDraft("");
    setBusy(true);
    setMsgs((m) => [...m, { id: -Date.now(), direction: "in", text: body, at: new Date().toISOString(), pending: true }]);
    try {
      await fetch("/api/sim/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: me.phone, text: body }),
      });
    } finally {
      setBusy(false);
      void poll();
    }
  }

  function switchTo(i: number) {
    setActive(i);
    save(ACTIVE, i);
  }

  function addIdentity() {
    const label = prompt("Name for this test person?")?.trim();
    if (!label) return;
    const phone = "2557" + Math.floor(10000000 + Math.random() * 89999999);
    const next = [...ids, { label, phone }];
    setIds(next);
    save(KEY, next);
    switchTo(next.length - 1);
  }

  const suggestions = useMemo(
    () =>
      msgs.length === 0
        ? ["Hi! I want to start a collection for my sister's wedding 💍", "Habari, nataka kuchangia", "Contribute "]
        : ["Who has paid so far?", "Who hasn't paid yet?", "Send reminders to pledgers", "Where did the money go?"],
    [msgs.length],
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="kanga" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden px-4 py-4 lg:px-6">
        {/* Identities */}
        <aside className="hidden w-72 shrink-0 flex-col gap-4 lg:flex">
          <Logo />
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Test as</p>
            <ul className="mt-3 space-y-1.5">
              {ids.map((p, i) => (
                <li key={p.phone}>
                  <button
                    onClick={() => switchTo(i)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      i === active ? "bg-forest text-paper" : "hover:bg-paper-2"
                    }`}
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="block font-mono text-[11px] opacity-70">+{p.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={addIdentity} className="mt-3 text-sm font-medium text-forest-2 underline">
              + add a person
            </button>
          </div>
          <div className="card p-4 text-sm leading-relaxed text-ink-soft">
            <p className="font-semibold text-ink">How to test</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>As <b>Organiser</b>, start a collection.</li>
              <li>Copy the code, switch to <b>Amina</b>, send “Contribute CODE”.</li>
              <li>Open the PayPal link and pay with a sandbox buyer.</li>
              <li>Switch back: you&apos;ll see the alert, then try a payout.</li>
            </ol>
            <button onClick={() => setShowHelp((s) => !s)} className="mt-3 font-medium text-forest-2 underline">
              Sandbox buyer login
            </button>
            {showHelp ? (
              <p className="mt-2 rounded-lg bg-paper-2 p-2 font-mono text-xs text-ink">
                {buyer.email ? (
                  <>
                    {buyer.email}
                    <br />
                    {buyer.password}
                  </>
                ) : (
                  "Use any PayPal sandbox personal account."
                )}
              </p>
            ) : null}
          </div>
        </aside>

        {/* Phone */}
        <section className="flex flex-1 flex-col overflow-hidden rounded-[1.6rem] border-[6px] border-ink bg-[var(--chat-bg)] shadow-2xl">
          <header className="flex items-center gap-3 bg-forest px-4 py-3 text-paper">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-marigold font-display text-lg font-bold text-ink">S</div>
            <div className="flex-1">
              <p className="font-semibold">SarafuPay</p>
              <p className="text-xs opacity-75">{busy ? "typing…" : "AI agent · same brain as WhatsApp"}</p>
            </div>
            <select
              value={active}
              onChange={(e) => switchTo(Number(e.target.value))}
              className="rounded-lg bg-forest-2 px-2 py-1 text-sm lg:hidden"
              aria-label="Test identity"
            >
              {ids.map((p, i) => (
                <option key={p.phone} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </header>
          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
            <p className="mx-auto w-fit rounded-lg bg-paper/80 px-3 py-1 text-center text-[11px] text-ink-soft">
              Chatting as <b>{me.label}</b> (+{me.phone}) · PayPal sandbox
            </p>
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`bubble max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px] leading-snug shadow-sm sm:max-w-[70%] ${
                    m.pending ? "opacity-70" : ""
                  }`}
                  style={{ background: m.direction === "in" ? "var(--bubble-out)" : "var(--bubble-in)" }}
                >
                  <Rich text={m.text} />
                  <span className="mt-1 block text-right text-[10px] text-ink-soft">
                    {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex justify-start">
                <div className="bubble rounded-2xl bg-[var(--bubble-in)] px-4 py-3 shadow-sm">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink-soft" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-2 sm:px-6">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setDraft(s)} className="shrink-0 rounded-full bg-paper/90 px-3 py-1.5 text-xs ring-1 ring-line hover:bg-paper">
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-2 bg-paper-2 px-3 py-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message"
              className="flex-1 rounded-full border border-line bg-white px-4 py-2.5 outline-none focus:border-forest"
              aria-label="Message"
            />
            <button
              disabled={busy || !draft.trim()}
              className="grid h-11 w-11 place-items-center rounded-full bg-forest text-paper disabled:opacity-40"
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
