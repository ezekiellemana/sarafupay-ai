import { redirect } from "next/navigation";
import { startCheckout } from "@/lib/services/core";

// Short, stable link we share in chat; creates the PayPal order on click so it never expires in the chat.
export async function GET(_req: Request, ctx: RouteContext<"/pay/[id]">) {
  const { id } = await ctx.params;
  let url: string;
  try {
    url = await startCheckout(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment link unavailable";
    redirect(`/pay/error?m=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}
