import "server-only";
import { timingSafeEqual } from "node:crypto";
import { findCollection } from "../services/core";

/** Owner-only access via the private dashboard key. */
export async function ownerCollection(code: string | null, key: string | null) {
  if (!code || !key) return undefined;
  const col = await findCollection(code);
  if (!col) return undefined;
  const a = Buffer.from(col.ownerKey);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b) ? col : undefined;
}
