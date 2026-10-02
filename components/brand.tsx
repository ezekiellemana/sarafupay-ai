import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 group" aria-label="SarafuPay home">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
      <img src="/brand/sarafupay-icon.png" width={34} height={34} alt="" className="h-[34px] w-[34px] rounded-full" />
      <span className={`font-display text-xl font-semibold tracking-tight ${light ? "text-paper" : "text-ink"}`}>
        <span style={{ color: light ? undefined : "#035034" }}>Sarafu</span><span style={{ color: "#C4A237" }}>Pay</span>
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
