import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "../env";

/** Errors worth trying the next model for: overloaded, rate limited, retired/unknown model. */
export function isRetryableModelError(e: unknown): boolean {
  const text = JSON.stringify(e, Object.getOwnPropertyNames(e as object)) + String(e);
  return /\b(503|429|404)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|overloaded|no longer available/i.test(text);
}

/**
 * Runs `fn` with each configured Gemini model in turn until one succeeds.
 * Keeps the demo alive when the free tier's primary model is under load.
 */
export async function withGeminiFallback<T>(fn: (model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>, id: string) => Promise<T>): Promise<T> {
  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey() });
  let last: unknown;
  for (const id of env.geminiModels()) {
    try {
      return await fn(google(id), id);
    } catch (e) {
      last = e;
      if (!isRetryableModelError(e)) throw e;
      console.warn(`[gemini] ${id} unavailable, trying next model`);
    }
  }
  throw last;
}
