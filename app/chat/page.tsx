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
  };
  return (
    <Suspense>
      <Simulator buyer={buyer} />
    </Suspense>
  );
}
