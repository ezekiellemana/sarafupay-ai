"use client";

import { useState } from "react";

/** Copies the public collection link so the organiser can paste it into the WhatsApp group. */
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="rounded-full border border-line bg-white px-3 py-1.5 text-sm transition-colors hover:border-forest"
    >
      {done ? "Copied ✓" : "Copy link"}
    </button>
  );
}
