"use client";

import { useState } from "react";

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Re-checks the card in the visitor's own browser: recompute the hash, then verify the Ed25519 signature. */
export function VerifyButton({ id, labels }: { id: string; labels: { idle: string; busy: string; ok: string; bad: string; unsupported: string } }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "bad" | "unsupported">("idle");
  const [detail, setDetail] = useState("");
  async function run() {
    setState("busy");
    try {
      const r = (await (await fetch(`/api/proof/${id}`)).json()) as { body: string; hash: string; sig: string; publicKey: string };
      const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(r.body)));
      if (digest !== r.hash) {
        setDetail(`sha256 ${digest.slice(0, 12)}… ≠ ${r.hash.slice(0, 12)}…`);
        return setState("bad");
      }
      let key: CryptoKey;
      try {
        key = await crypto.subtle.importKey("raw", b64url(r.publicKey), { name: "Ed25519" }, false, ["verify"]);
      } catch {
        return setState("unsupported");
      }
      const hashBytes = Uint8Array.from(r.hash.match(/../g)!.map((h) => parseInt(h, 16)));
      const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64url(r.sig), hashBytes);
      setDetail(`sha256 ${digest.slice(0, 16)}…`);
      setState(ok ? "ok" : "bad");
    } catch (e) {
      setDetail(String(e));
      setState("bad");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={state === "busy"} className="btn btn-ghost text-sm">
        {state === "busy" ? labels.busy : labels.idle}
      </button>
      {state === "ok" ? <span className="text-sm font-semibold text-forest">✓ {labels.ok}</span> : null}
      {state === "bad" ? <span className="text-sm font-semibold text-terracotta">✗ {labels.bad}</span> : null}
      {state === "unsupported" ? <span className="text-sm text-ink-soft">{labels.unsupported}</span> : null}
      {detail && state !== "busy" ? <span className="basis-full font-mono text-[11px] text-ink-soft">{detail}</span> : null}
    </div>
  );
}
