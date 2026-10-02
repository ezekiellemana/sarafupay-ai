import { redirect } from "next/navigation";
import { getCollectionById, settleOrder } from "@/lib/services/core";

// PayPal sends the payer back here with ?token=<orderId> after approval.
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("token");
  if (!orderId) redirect("/pay/error?m=Missing%20order");
  let target = "/pay/error?m=We%20could%20not%20confirm%20this%20payment";
  try {
    const ctb = await settleOrder(orderId);
    const col = ctb ? await getCollectionById(ctb.collectionId) : undefined;
    if (ctb && col) target = `/c/${col.code}/thanks?ctb=${ctb.id}`;
  } catch (e) {
    console.error("[pay/return]", e);
  }
  redirect(target);
}
