import { NextResponse } from "next/server";
import { generateText, isStepCount, jsonSchema, tool, type ModelMessage, type Tool } from "ai";
import { withGeminiFallback } from "@/lib/agent/models";
import type { AgAiConversationItem, AgLlmRequest, AgLlmResponse, AgAiOutputItem } from "ag-studio";
import { env } from "@/lib/env";
import { ownerCollection } from "@/lib/studio/auth";
import { takeAiCall } from "@/lib/limits";

/**
 * Server half of the AG Studio LLM adapter: one Studio "turn" -> one Gemini call.
 * Tools are declared without execute, so Gemini's tool calls go back to Studio,
 * which runs them in the browser (Studio's own tools and ours).
 */

function textOf(content: { type: string; text?: string }[]): string {
  return content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("");
}

function toModelMessages(items: AgAiConversationItem[]): { system: string[]; messages: ModelMessage[] } {
  const system: string[] = [];
  const messages: ModelMessage[] = [];
  const names = new Map<string, string>();
  const pushAssistant = (part: unknown) => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && Array.isArray(last.content)) (last.content as unknown[]).push(part);
    else messages.push({ role: "assistant", content: [part] } as ModelMessage);
  };
  for (const item of items) {
    switch (item.type) {
      case "message":
        if (item.kind === "input") {
          const t = textOf(item.content as { type: string; text?: string }[]);
          if (item.role === "system") system.push(t);
          else if (t) messages.push({ role: "user", content: t });
        } else {
          const t = item.content.map((c) => (c.type === "text" ? c.text : c.refusal)).join("");
          if (t) pushAssistant({ type: "text", text: t });
        }
        break;
      case "function_call": {
        names.set(item.callId, item.name);
        let input: unknown = {};
        try {
          input = item.arguments ? JSON.parse(item.arguments) : {};
        } catch {
          input = {};
        }
        pushAssistant({ type: "tool-call", toolCallId: item.callId, toolName: item.name, input });
        if (item.result !== undefined) {
          messages.push({
            role: "tool",
            content: [{ type: "tool-result", toolCallId: item.callId, toolName: item.name, output: { type: "text", value: item.result } }],
          });
        }
        break;
      }
      case "function_call_output": {
        const part = {
          type: "tool-result" as const,
          toolCallId: item.callId,
          toolName: names.get(item.callId) ?? "tool",
          output: { type: "text" as const, value: item.output },
        };
        const last = messages[messages.length - 1];
        if (last?.role === "tool" && Array.isArray(last.content)) (last.content as unknown[]).push(part);
        else messages.push({ role: "tool", content: [part] });
        break;
      }
      default:
        break; // reasoning items are not replayed
    }
  }
  return { system, messages };
}

/** Gemini rejects a few JSON-schema keywords; strip them recursively. */
function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (["$schema", "$id", "examples", "default"].includes(k)) continue;
    out[k] = clean(v);
  }
  return out;
}

export async function POST(req: Request) {
  const col = await ownerCollection(req.headers.get("x-collection"), req.headers.get("x-owner-key"));
  if (!col) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!env.geminiApiKey()) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });
  if (!takeAiCall(`studio:${col.code}`, 80).ok)
    return NextResponse.json({ error: "Too many AI requests right now. Please wait a few minutes." }, { status: 429 });

  const body = (await req.json()) as AgLlmRequest;
  const { system, messages } = toModelMessages(body.input ?? []);
  const tools: Record<string, Tool> = {};
  for (const t of body.tools ?? []) {
    tools[t.name] = tool({ description: t.description, inputSchema: jsonSchema(clean(t.parameters) as never) });
  }
  const id = `resp_${crypto.randomUUID()}`;
  try {
    let usedModel = env.geminiModel();
    const result = await withGeminiFallback((model, modelId) => {
      usedModel = modelId;
      return generateText({
      model,
      system: [body.instructions, ...system].filter(Boolean).join("\n\n") || undefined,
      messages: messages.length ? messages : [{ role: "user", content: "Hello" }],
      tools: Object.keys(tools).length ? tools : undefined,
      toolChoice:
        body.toolChoice && typeof body.toolChoice === "object"
          ? { type: "tool", toolName: body.toolChoice.name }
          : (body.toolChoice as "auto" | "none" | "required" | undefined),
      stopWhen: isStepCount(1),
      temperature: 0.2,
      maxRetries: 1,
      });
    });
    const output: AgAiOutputItem[] = [];
    if (result.text) {
      output.push({
        id: `msg_${crypto.randomUUID()}`,
        kind: "output",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "text", text: result.text, annotations: [] }],
      });
    }
    for (const call of result.toolCalls) {
      output.push({
        id: `fc_${crypto.randomUUID()}`,
        kind: "output",
        type: "function_call",
        callId: call.toolCallId,
        name: call.toolName,
        arguments: JSON.stringify(call.input ?? {}),
        status: "completed",
      });
    }
    const res: AgLlmResponse = {
      id,
      createdAt: Date.now(),
      output,
      status: "completed",
      model: usedModel,
      usage: result.usage
        ? ({ inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 } as never)
        : undefined,
    };
    return NextResponse.json(res);
  } catch (e) {
    console.error("[studio llm]", e);
    const res: AgLlmResponse = {
      id,
      createdAt: Date.now(),
      output: [],
      status: "failed",
      error: { code: "llm_error", message: e instanceof Error ? e.message : String(e) },
    };
    return NextResponse.json(res);
  }
}
