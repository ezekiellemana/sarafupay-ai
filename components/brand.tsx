import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 group" aria-label="SarafuPay home">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <circle cx="17" cy="17" r="16" fill={light ? "#f7f0e3" : "#0e3b2c"} />
        <circle cx="12" cy="15" r="5.5" fill="#f2a516" />
        <circle cx="22" cy="15" r="5.5" fill="#c4502f" opacity="0.9" />
        <circle cx="17" cy="22" r="5.5" fill={light ? "#0e3b2c" : "#f7f0e3"} opacity="0.95" />
      </svg>
      <span className={`font-display text-xl font-semibold tracking-tight ${light ? "text-paper" : "text-ink"}`}>
        Sarafu<span className="text-terracotta">Pay</span>
      </span>
    </Link>
  );
}

export function SandboxBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1 text-xs font-medium text-ink-soft">
      <span className="h-1.5 w-1.5 rounded-full bg-marigold" /> PayPal sandbox · test money
    </span>
  );
}

export function Progress({ percent }: { percent: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-paper-2 ring-1 ring-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(2, percent)}%`,
          background: "repeating-linear-gradient(45deg, #0e3b2c 0 10px, #15543f 10px 20px)",
        }}
      />
    </div>
  );
}
