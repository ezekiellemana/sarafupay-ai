import Link from "next/link";
import { Logo } from "@/components/brand";

export default async function PayError({ searchParams }: PageProps<"/pay/error">) {
  const { m } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <Logo />
      <div className="card mt-10 p-8">
        <p className="text-4xl">😕</p>
        <h1 className="font-display mt-3 text-2xl font-semibold">Payment link unavailable</h1>
        <p className="mt-2 text-ink-soft">{typeof m === "string" ? m : "Something went wrong."}</p>
        <Link href="/chat" className="btn btn-primary mt-6">Ask the agent for a new link</Link>
      </div>
    </main>
  );
}
