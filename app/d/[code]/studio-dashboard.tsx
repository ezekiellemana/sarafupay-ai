"use client";

import dynamic from "next/dynamic";

export type DashboardData = {
  contributions: { contributor: string; amount: number; channel: string; paid_on: string; message: string; paypal_ref: string }[];
  pledges: { pledger: string; amount: number; due: string; status: string; reminded: string }[];
  payouts: { recipient: string; amount: number; purpose: string; status: string; sent_on: string }[];
};

export type StudioProps = {
  code: string;
  ownerKey: string;
  currency: string;
  data: DashboardData;
  licenseKey: string;
};

// AG Studio touches the DOM on import, so render it client-side only.
const Inner = dynamic(() => import("./studio-inner"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-ink-soft">
      <p className="animate-pulse font-display text-xl">Loading treasurer dashboard…</p>
    </div>
  ),
});

export function StudioDashboard(props: StudioProps) {
  return <Inner {...props} />;
}
