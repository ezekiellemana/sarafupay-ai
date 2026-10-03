"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Search box for the supporters list: updates `?q=` as you type (debounced), resets to page 1. */
export function SupporterSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function push(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next.trim()) sp.set("q", next.trim());
    else sp.delete("q");
    sp.delete("page");
    const qs = sp.toString();
    start(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}#supporters`, { scroll: false }));
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        push(q);
      }}
      className="relative"
    >
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (timer.current) clearTimeout(timer.current);
          // Emails only match exactly, so don't search half-typed ones.
          if (v.includes("@") && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.trim())) return;
          timer.current = setTimeout(() => push(v), 300);
        }}
        placeholder="Find by name, or your full PayPal email"
        aria-label="Find a supporter by name or email"
        autoComplete="off"
        maxLength={120}
        className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-10 text-base outline-none focus:border-forest sm:text-sm"
      />
      {pending ? <span className="spinner absolute right-3.5 top-1/2 -translate-y-1/2" aria-label="Searching" /> : null}
    </form>
  );
}
