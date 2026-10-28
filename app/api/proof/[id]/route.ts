import { getCard, signingKey } from "@/lib/services/evidence";

// An evidence card exactly as it was signed, plus the public key, so anyone can verify it themselves:
// sha256(body) must equal hash, and hash must carry a valid Ed25519 signature from publicKey.
export async function GET(_req: Request, ctx: RouteContext<"/api/proof/[id]">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "not found" }, { status: 404 });
  const key = signingKey();
  return Response.json(
    { id: card.id, seq: card.seq, body: card.body, hash: card.hash, sig: card.sig, alg: "Ed25519 over sha256(body)", publicKey: key.publicKey, devKey: key.dev },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
