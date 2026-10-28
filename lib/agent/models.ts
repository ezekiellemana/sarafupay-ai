import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "../env";

/** Errors worth trying the next model for: overloaded, rate limited, retired/unknown model, too slow. */
export function isRetryableModelError(e: unknown): boolean {
  const text = JSON.stringify(e, Object.getOwnPropertyNames(e as object)) + String(e);
  return /\b(503|429|404)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|overloaded|no longer available|TimeoutError|AbortError|timeout of \d+ms exceeded|aborted due to timeout/i.test(text);
}

/**
 * Runs `fn` with each configured Gemini model in turn until one succeeds.
 * Keeps the demo alive when the free tier's primary model is under load.
 */
export async function withGeminiFallback<T>(
  fn: (model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>, id: string) => Promise<T>,
  /** Return false when a retry is unsafe, e.g. a tool already changed something on the failed try. */
  canRetry: () => boolean = () => true,
): Promise<T> {
  const google = createGoogleGenerativeAI({ apiKey: env.geminiApiKey() });
  let last: unknown;
  for (const id of env.geminiModels()) {
    try {
      return await fn(google(id), id);
    } catch (e) {
      last = e;
      if (!isRetryableModelError(e) || !canRetry()) throw e;
      console.warn(`[gemini] ${id} unavailable, trying next model`);
    }
  }
  throw last;
}

type GeminiModel = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
type ChainModel = Pick<GeminiModel, "specificationVersion" | "provider" | "modelId" | "supportedUrls" | "doGenerate" | "doStream">;

/**
 * One model that falls back across the Gemini models on every call, i.e. on every agent step.
 * Tools run between steps, never inside a call, so trying a step again on the next model can't
 * repeat a tool. That keeps a hang after a tool has run (a collection created, a reminder sent)
 * from ending in an apology: the next model just carries on from the tool's result.
 */
export function geminiChain(callMs = 20_000, models?: ChainModel[]): ChainModel {
  const chain = models ?? env.geminiModels().map((id) => createGoogleGenerativeAI({ apiKey: env.geminiApiKey() })(id));
  const first = chain[0]!;
  return {
    specificationVersion: first.specificationVersion,
    provider: first.provider,
    modelId: first.modelId,
    supportedUrls: first.supportedUrls,
    async doGenerate(options) {
      let last: unknown;
      for (const model of chain) {
        const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(callMs)]) : AbortSignal.timeout(callMs);
        try {
          return await model.doGenerate({ ...options, abortSignal: signal });
        } catch (e) {
          last = e;
          // The caller gave up (overall timeout): stop rather than start another model.
          if (options.abortSignal?.aborted || !isRetryableModelError(e)) throw e;
          console.warn(`[gemini] ${model.modelId} failed on a step, trying next model`);
        }
      }
      throw last;
    },
    doStream: (options) => first.doStream(options),
  };
}
