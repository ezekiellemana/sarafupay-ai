"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand";

type Msg = { id: number; direction: "in" | "out"; text: string; at: string; pending?: boolean; fresh?: boolean };
type Persona = { id: string; label: string; hint: string };

const BUILT_IN: Persona[] = [
  { id: "organiser", label: "Organiser", hint: "Starts the collection" },
  { id: "amina", label: "Amina", hint: "Friend in Tanzania" },
  { id: "john", label: "John", hint: "Friend in the UK" },
];
const CUSTOM_KEY = "sarafupay.sim.people.v2";
const ACTIVE_KEY = "sarafupay.sim.active.v2";

// Poll fast only while a reply is expected; idle tabs poll slowly; hidden tabs don't poll.
const FAST_MS = 1200;
const IDLE_MS = 6000;
const EXPECT_REPLY_MS = 45_000;

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode: fine, just not remembered */
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

function initials(label: string) {
  return label.trim().slice(0, 1).toUpperCase();
}

export function Simulator({ buyer }: { buyer: { email: string; password: string; payee: string } }) {
  const search = useSearchParams();
  const [custom, setCustom] = useState<Persona[]>([]);
  const [active, setActive] = useState("organiser");
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const lastId = useRef(0);
  const lastSend = useRef(0);
  const firstLoad = useRef(true);
  const polling = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const people = useMemo(() => [...BUILT_IN, ...custom], [custom]);
  const me = people.find((p) => p.id === active) ?? BUILT_IN[0];

  // 1. Restore local preferences and open (or resume) this browser's private session.
  useEffect(() => {
    const saved = read<Persona[]>(CUSTOM_KEY, []);
    const prefill = search.get("text");
    // Hydrate after mount; localStorage and the session cookie don't exist during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustom(saved);
    if (prefill) {
      setDraft(prefill);
      // A shared "Contribute CODE" link means you're joining as a friend, not organising.
      if (/^(contribute|changia)\b/i.test(prefill)) setActive("amina");
      else setActive(read(ACTIVE_KEY, "organiser"));
    } else {
      setActive(read(ACTIVE_KEY, "organiser"));
    }
    void fetch("/api/sim/session", { method: "POST" }).finally(() => setReady(true));
  }, [search]);

  const poll = useCallback(async () => {
    if (polling.current || !ready) return; // never overlap polls
    polling.current = true;
    try {
      const res = await fetch(`/api/sim/inbox?persona=${active}&after=${lastId.current}`, { cache: "no-store" });
      if (res.status === 401) {
        await fetch("/api/sim/session", { method: "POST" });
        return;
      }
      if (!res.ok) return;
      const { phone, messages } = (await res.json()) as { phone: string; messages: Msg[] };
      setPhones((p) => (p[active] === phone ? p : { ...p, [active]: phone }));
      const fresh = !firstLoad.current;
      firstLoad.current = false;
      if (!messages.length) return;
      lastId.current = Math.max(lastId.current, messages[messages.length - 1].id);
      setMsgs((prev) => {
        const seen = new Set(prev.filter((m) => !m.pending).map((m) => m.id));
        const add = messages.filter((m) => !seen.has(m.id)).map((m) => ({ ...m, fresh }));
        const hasIn = add.some((m) => m.direction === "in");
        return [...prev.filter((m) => !(m.pending && hasIn)), ...add];
      });
    } finally {
      polling.current = false;
    }
  }, [active, ready]);

  // 2. Adaptive polling for the active person's inbox.
  useEffect(() => {
    if (!ready) return;
    lastId.current = 0;
    firstLoad.current = true;
    // Switching person starts a clean thread before loading their inbox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsgs([]);
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden) await poll();
      const expecting = Date.now() - lastSend.current < EXPECT_REPLY_MS;
      timer = setTimeout(loop, expecting ? FAST_MS : IDLE_MS);
    };
    void loop();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, ready]);

  // 3. Keep the latest message in view; jump on first load, glide for new messages.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    const anyFresh = msgs.some((m) => m.fresh || m.pending);
    if (!anyFresh || nearBottom || busy) {
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: anyFresh ? "smooth" : "auto" }));
    }
  }, [msgs, busy]);

  useEffect(() => {
    if (!menu && !adding && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      setAdding(false);
      setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, adding, sheet]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy || !ready) return;
    setDraft("");
    setBusy(true);
    lastSend.current = Date.now();
    setMsgs((m) => [...m, { id: -Date.now(), direction: "in", text: body, at: new Date().toISOString(), pending: true, fresh: true }]);
    try {
      const res = await fetch("/api/sim/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: active, text: body }),
      });
      if (res.status === 429) {
        setMsgs((m) => [
          ...m,
          { id: -Date.now() - 1, direction: "out", text: "⏳ Too many messages from this browser. Please wait a few minutes.", at: new Date().toISOString(), fresh: true },
        ]);
      }
    } finally {
      setBusy(false);
      void poll();
      input.current?.focus({ preventScroll: true });
    }
  }

  function choose(id: string) {
    setActive(id);
    write(ACTIVE_KEY, id);
    setSheet(false);
    setMenu(false);
  }

  function openAdd() {
    setMenu(false);
    setSheet(false);
    setNewName("");
    setAdding(true);
  }

  function addPerson(name = newName) {
    const label = name.trim().slice(0, 24);
    if (!label) return;
    const p: Persona = { id: newPersonId(), label, hint: "Extra test person" };
    const next = [...custom, p];
    setCustom(next);
    write(CUSTOM_KEY, next);
    setNewName("");
    setAdding(false);
    choose(p.id);
  }

  async function startFresh() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    await fetch("/api/sim/session?reset=1", { method: "POST" });
    setPhones({});
    setMsgs([]);
    lastId.current = 0;
    firstLoad.current = true;
    setSheet(false);
    void poll();
  }

  const suggestions =
    msgs.length === 0
      ? active === "organiser"
        ? ["Hi! I want to start a collection for my sister's wedding 💍", "Habari, nataka kuanzisha mchango wa msiba"]
        : ["Contribute ", "Changia "]
      : active === "organiser"
        ? ["Who has paid so far?", "Who hasn't paid yet?", "Send reminders to pledgers", "Send me the dashboard link"]
        : ["How much is left to reach the goal?", "I'll pay $20 on Friday", "Where did the money go?"];

  const avatar = (p: Persona, on: boolean) => (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-semibold ${on ? "bg-marigold text-ink" : "bg-paper-2 text-ink"}`}
    >
      {initials(p.label)}
    </span>
  );

  const peopleList = (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Chat as</p>
      <ul className="mt-3 space-y-1.5">
        {people.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => choose(p.id)}
              aria-pressed={p.id === active}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                p.id === active ? "bg-forest text-paper" : "hover:bg-paper-2"
              }`}
            >
              {avatar(p, p.id === active)}
              <span className="min-w-0">
                <span className="block font-semibold">{p.label}</span>
                <span className="block truncate text-xs opacity-75">{phones[p.id] ? `+${phones[p.id]}` : p.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={openAdd}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-sm font-medium text-forest-2 transition-colors hover:bg-paper-2"
      >
        <span aria-hidden>＋</span> Add person
      </button>
    </div>
  );

  const helpPanel = (
    <>
      <div className="text-sm leading-relaxed text-ink-soft">
        <p className="font-semibold text-ink">How to test</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>As <b>Organiser</b>, start a collection.</li>
          <li>Switch to <b>Amina</b> and send “Contribute CODE”.</li>
          <li>Open the PayPal link and pay with the sandbox buyer below.</li>
          <li>
            Back as Organiser: see the alert, then try a payout
            {buyer.payee ? (
              <>
                , e.g. <span className="select-all break-all font-mono text-xs">pay {buyer.payee} $5 for the deposit</span>, and reply
                with the CONFIRM code.
              </>
            ) : (
              " to a PayPal sandbox account email, and reply with the CONFIRM code."
            )}
          </li>
        </ol>
        <button onClick={() => setShowLogin((s) => !s)} className="mt-3 font-medium text-forest-2 underline">
          {showLogin ? "Hide" : "Show"} sandbox buyer login
        </button>
        {showLogin ? (
          <p className="mt-2 select-all break-all rounded-lg bg-paper-2 p-2 font-mono text-xs text-ink">
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

      <div className="border-t border-line pt-4 text-xs text-ink-soft">
        <p>
          🔒 This is your <b>private test session</b>. Other visitors can&apos;t see your chats. All payments use the PayPal
          sandbox (test money).
        </p>
        <button
          onClick={() => void startFresh()}
          className={`mt-3 rounded-full px-3 py-1.5 font-medium transition-colors ${
            confirmReset ? "bg-terracotta text-paper" : "ring-1 ring-line hover:bg-paper-2"
          }`}
        >
          {confirmReset ? "Tap again to clear everything" : "↺ Start fresh"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="kanga hidden sm:block" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden sm:px-4 sm:py-4 lg:px-6">
        {/* Desktop side panel */}
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
          <Logo />
          <div className="card space-y-5 p-4">
            {peopleList}
            {helpPanel}
          </div>
        </aside>

        {/* Chat: full-bleed on phones, framed on larger screens */}
        <section className="sim-frame flex flex-1 flex-col overflow-hidden bg-[var(--chat-bg)] sm:rounded-[1.6rem] sm:border-[6px] sm:border-ink">
          <header className="flex items-center gap-3 bg-forest px-3 py-2.5 text-paper sm:px-4 sm:py-3 [padding-top:max(0.625rem,env(safe-area-inset-top))]">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img src="/brand/sarafupay-icon.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-paper" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">SarafuPay</p>
              <p className="truncate text-xs opacity-80">{busy ? "typing…" : "AI agent · same brain as WhatsApp"}</p>
            </div>
            <div className="relative lg:hidden">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-full bg-forest-2 py-1 pl-1 pr-3 text-sm transition-colors active:bg-forest"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label={`Chatting as ${me.label}. Change person`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-marigold font-semibold text-ink">{initials(me.label)}</span>
                <span className="max-w-[6.5rem] truncate">{me.label}</span>
                <span aria-hidden className={`text-xs transition-transform duration-200 ${menu ? "rotate-180" : ""}`}>▾</span>
              </button>
              {menu ? <button className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setMenu(false)} /> : null}
              <div className={`menu-pop ${menu ? "open" : ""}`} role="menu" inert={!menu}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Chat as</p>
                {people.map((p) => (
                  <button
                    key={p.id}
                    role="menuitemradio"
                    aria-checked={p.id === active}
                    onClick={() => choose(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink transition-colors ${
                      p.id === active ? "bg-paper-2" : "active:bg-paper-2"
                    }`}
                  >
                    {avatar(p, p.id === active)}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.label}</span>
                      <span className="block truncate text-xs text-ink-soft">{phones[p.id] ? `+${phones[p.id]}` : p.hint}</span>
                    </span>
                    {p.id === active ? <span className="text-forest-2" aria-hidden>✓</span> : null}
                  </button>
                ))}
                <div className="my-1.5 border-t border-line" />
                <button role="menuitem" onClick={openAdd} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-forest-2 active:bg-paper-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-forest-2" aria-hidden>＋</span>
                  Add person
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setSheet(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink active:bg-paper-2"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-2" aria-hidden>?</span>
                  Help, sandbox login &amp; reset
                </button>
              </div>
            </div>
          </header>

          <div ref={scroller} className="chat-scroll flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
            <p className="mx-auto w-fit max-w-full rounded-lg bg-paper/80 px-3 py-1 text-center text-[11px] text-ink-soft">
              Chatting as <b>{me.label}</b>
              {phones[active] ? <> (+{phones[active]})</> : null} · private session · PayPal sandbox
            </p>
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`bubble max-w-[86%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-[70%] sm:text-[14px] ${
                    m.fresh ? "bubble-in" : ""
                  } ${m.pending ? "opacity-70" : ""}`}
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
              <div className="flex justify-start" aria-live="polite" aria-label="SarafuPay is typing">
                <div className="bubble bubble-in rounded-2xl bg-[var(--bubble-in)] px-4 py-3">
                  <span className="typing" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2 sm:px-6">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setDraft(s);
                  input.current?.focus();
                }}
                className="shrink-0 rounded-full bg-paper/90 px-3 py-1.5 text-xs ring-1 ring-line transition-colors hover:bg-paper"
              >
                {s.trim()}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-2 bg-paper-2 px-3 pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ready ? "Type a message" : "Starting your private session…"}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-forest"
              aria-label="Message"
            />
            <button
              disabled={busy || !ready || !draft.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-paper transition-opacity disabled:opacity-40"
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </section>
      </div>

      {/* Mobile bottom sheet: help, sandbox login and reset */}
      <div className={`sheet-backdrop lg:hidden ${sheet ? "open" : ""}`} onClick={() => setSheet(false)} aria-hidden />
      <div
        className={`sheet lg:hidden ${sheet ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Help and settings"
        inert={!sheet}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="space-y-5">{helpPanel}</div>
        <button onClick={() => setSheet(false)} className="btn btn-primary mt-5 w-full justify-center">
          Done
        </button>
      </div>

      {/* Add-person dialog */}
      <div className={`dialog-backdrop ${adding ? "open" : ""}`} onClick={() => setAdding(false)} aria-hidden />
      <div className={`dialog ${adding ? "open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="add-title" inert={!adding}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addPerson();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="add-title" className="font-display text-2xl font-semibold">Add a test person</h2>
              <p className="mt-1 text-sm text-ink-soft">They get their own private test number, so you can chat as them.</p>
            </div>
            <button type="button" onClick={() => setAdding(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-paper-2" aria-label="Close">
              ✕
            </button>
          </div>
          <label className="mt-5 block text-sm font-medium">
            Name
            <input
              key={adding ? "open" : "closed"}
              autoFocus={adding}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={24}
              placeholder="e.g. Baraka"
              enterKeyHint="done"
              className="mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-base outline-none focus:border-forest"
            />
          </label>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-ink-soft">Quick picks</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Baraka", "Grace", "Mama Lishe", "Juma"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => addPerson(n)}
                className="rounded-full bg-paper-2 px-3 py-1.5 text-sm ring-1 ring-line transition-colors hover:bg-paper"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost flex-1 justify-center">
              Cancel
            </button>
            <button disabled={!newName.trim()} className="btn btn-primary flex-1 justify-center disabled:opacity-40">
              Add &amp; chat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Short random id for a custom test person (only ever called from event handlers). */
function newPersonId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}
