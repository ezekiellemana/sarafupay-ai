"use client";

import { useRef, useState } from "react";
import { currencyMeta, formatAmountInput } from "@/lib/format";

/**
 * One amount field: currency symbol in front, thousands grouped as you type, quick picks that fill it,
 * and a live "You'll pay …" line. Submits a plain number as `amount`.
 */
export function AmountInput({ currency, initial }: { currency: string; initial?: number }) {
  const meta = currencyMeta(currency);
  const start = initial ?? meta.presets[1];
  const [text, setText] = useState(formatAmountInput(String(start), meta.decimals));
  const ref = useRef<HTMLInputElement>(null);
  const value = Number(text.replace(/,/g, "")) || 0;

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    // Keep the caret after the same number of digits once commas are re-inserted.
    const caret = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/[^0-9.]/g, "").length;
    const next = formatAmountInput(el.value, meta.decimals);
    setText(next);
    requestAnimationFrame(() => {
      const input = ref.current;
      if (!input || document.activeElement !== input) return;
      let pos = 0;
      for (let seen = 0; pos < next.length && seen < digitsBefore; pos++) if (/[0-9.]/.test(next[pos])) seen++;
      input.setSelectionRange(pos, pos);
    });
  }

  const pretty = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: meta.code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  const fmt = (n: number) => {
    try {
      return pretty.format(n);
    } catch {
      return `${n} ${meta.code}`;
    }
  };

  return (
    <div>
      <label htmlFor="amount" className="text-sm font-medium">
        Amount
      </label>
      <div className="amount-field mt-1.5 flex items-center rounded-2xl border border-line bg-white pl-4 pr-3 focus-within:border-forest">
        <span className="font-display text-2xl text-ink-soft" aria-hidden>
          {meta.symbol}
        </span>
        <input
          ref={ref}
          id="amount"
          name="amount"
          value={text}
          onChange={onChange}
          inputMode="decimal"
          autoComplete="off"
          required
          aria-describedby="amount-hint"
          className="min-w-0 flex-1 bg-transparent px-2 py-3 font-display text-3xl font-semibold tracking-tight outline-none"
        />
        <span className="rounded-full bg-paper-2 px-2.5 py-1 font-mono text-xs text-ink-soft">{meta.code}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {meta.presets.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setText(formatAmountInput(String(v), meta.decimals))}
              aria-pressed={on}
              className={`rounded-xl border py-2 text-center font-mono text-sm transition-colors ${
                on ? "border-forest bg-forest text-paper" : "border-line bg-white hover:border-forest"
              }`}
            >
              {meta.symbol}
              {v.toLocaleString("en-US")}
            </button>
          );
        })}
      </div>
      <p id="amount-hint" className="mt-2 text-xs text-ink-soft" aria-live="polite">
        {value > 0 ? (
          <>
            You&apos;ll pay <strong className="text-ink">{fmt(value)}</strong> {meta.code} via PayPal
          </>
        ) : (
          "Enter how much you'd like to give"
        )}
      </p>
    </div>
  );
}
