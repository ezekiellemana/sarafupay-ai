import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { Simulator } from "./simulator";

export const metadata = { title: "SarafuPay — chat simulator" };

export default async function ChatPage() {
  await connection();
  if (!env.simulatorEnabled()) notFound();
  const buyer = {
    email: process.env.SANDBOX_BUYER_EMAIL ?? "",
    password: process.env.SANDBOX_BUYER_PASSWORD ?? "",
    // Payouts in the PayPal sandbox only succeed to a real sandbox account; a made-up
    // email (e.g. caterer@example.com) ends UNCLAIMED and the payout is marked failed.
    payee: process.env.SANDBOX_PAYEE_EMAIL ?? process.env.SANDBOX_BUYER_EMAIL ?? "",
  };
  return (
    <Suspense>
      <Simulator buyer={buyer} />
    </Suspense>
  );
}
