import type { AgAiEvent, AgLlmAdapter, AgLlmRequest, AgLlmResponse } from "ag-studio";

/**
 * AG Studio LLM adapter that proxies each turn to our server (/api/studio/llm),
 * which calls Gemini. The server replies with a complete AgLlmResponse; we replay it
 * as AG-UI style events so the chat panel renders text and tool calls.
 */
export function geminiProxyAdapter(opts: { endpoint: string; headers: Record<string, string> }): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options) {
      let resolveComplete!: (r: AgLlmResponse) => void;
      const complete = new Promise<AgLlmResponse>((r) => (resolveComplete = r));

      const responsePromise: Promise<AgLlmResponse> = fetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...opts.headers },
        body: JSON.stringify(request),
        signal: options?.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`LLM proxy ${res.status}: ${await res.text()}`);
          return (await res.json()) as AgLlmResponse;
        })
        .catch(
          (e): AgLlmResponse => ({
            id: `err_${Date.now()}`,
            createdAt: Date.now(),
            output: [],
            status: options?.signal?.aborted ? "cancelled" : "failed",
            error: { code: "network", message: e instanceof Error ? e.message : String(e) },
          }),
        );

      async function* events(): AsyncGenerator<AgAiEvent> {
        const res = await responsePromise;
        for (const item of res.output) {
          if (item.type === "message") {
            const text = item.content.map((c) => (c.type === "text" ? c.text : c.refusal)).join("");
            yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" };
            yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: text };
            yield { type: "TEXT_MESSAGE_END", messageId: item.id };
          } else if (item.type === "function_call") {
            yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
            yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
            yield { type: "TOOL_CALL_END", toolCallId: item.callId };
          }
        }
        if (res.status === "failed" && res.error) {
          yield { type: "RUN_ERROR", message: res.error.message, code: res.error.code };
        }
        resolveComplete(res);
      }

      // Make sure `complete` resolves even if nobody iterates the stream.
      void responsePromise.then((r) => setTimeout(() => resolveComplete(r), 0));
      return { stream: events(), complete };
    },
  };
}
