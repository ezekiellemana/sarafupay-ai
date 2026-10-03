import Link from "next/link";
import { Logo } from "@/components/brand";

export default async function PayError({ searchParams }: PageProps<"/pay/error">) {
  const { m } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-5 py-12 text-center sm:px-6 sm:py-16">
      <Logo />
      <div className="card mt-8 p-6 sm:mt-10 sm:p-8">
        <p className="text-4xl">😕</p>
        <h1 className="font-display mt-3 text-2xl font-semibold">Payment link unavailable</h1>
        <p className="mt-2 text-ink-soft">{typeof m === "string" ? m : "Something went wrong."}</p>
        <Link href="/chat" className="btn btn-primary mt-6">Ask the agent for a new link</Link>
      </div>
    </main>
  );
}
