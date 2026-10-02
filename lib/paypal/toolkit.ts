import "server-only";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { tool, type Tool } from "ai";
import { env } from "../env";

// PayPal Agent Toolkit. Note: context.sandbox defaults to FALSE inside the toolkit,
// so it must be set explicitly or calls go to production.
let toolkit: PayPalAgentToolkit | undefined;

function getToolkit(): PayPalAgentToolkit {
  toolkit ??= new PayPalAgentToolkit({
    clientId: env.paypalClientId(),
    clientSecret: env.paypalSecret(),
    configuration: {
      actions: {
        invoices: { create: true, send: true, sendReminder: true, generateQRC: true, get: true },
        orders: { get: true },
      },
      context: { sandbox: true },
    },
  });
  return toolkit;
}

type LegacyTool = { description?: string; parameters: unknown; execute: (input: unknown) => Promise<unknown> };

function raw(name: string): LegacyTool {
  const t = (getToolkit().getTools() as unknown as Record<string, LegacyTool>)[name];
  if (!t) throw new Error(`Agent Toolkit tool ${name} not enabled`);
  return t;
}

function parse(result: unknown): Record<string, unknown> {
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return { raw: result };
    }
  }
  return (result ?? {}) as Record<string, unknown>;
}

/**
 * Agent Toolkit tools (built for AI SDK v4) re-wrapped for AI SDK v7.
 * Their zod schemas implement Standard Schema, so they plug straight into inputSchema.
 */
export function toolkitToolsForAgent(names: string[]): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const name of names) {
    const t = raw(name);
    out[name] = tool({
      description: `[PayPal Agent Toolkit] ${t.description ?? name}`,
      inputSchema: t.parameters as never,
      execute: async (input: unknown) => parse(await t.execute(input)),
    });
  }
  return out;
}

/** Deterministic invoice flow for a pledge, executed through the Agent Toolkit. */
export async function createAndSendPledgeInvoice(input: {
  invoiceNumber: string;
  recipientEmail: string;
  recipientName: string;
  amountValue: string;
  currency: string;
  collectionTitle: string;
  collectionCode: string;
  dueDate?: string | null;
}): Promise<{ invoiceId: string; payLink?: string; qrBase64?: string }> {
  const [given, ...rest] = input.recipientName.split(" ");
  const created = parse(
    await raw("create_invoice").execute({
      currency_code: input.currency,
      invoice_number: input.invoiceNumber,
      reference: input.collectionCode,
      note: `Pledge to "${input.collectionTitle}" (${input.collectionCode}) via SarafuPay.${input.dueDate ? ` Promised by ${input.dueDate}.` : ""}`,
      invoicer_business_name: "SarafuPay Collections",
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: given || input.recipientName, surname: rest.join(" ") || undefined },
            email_address: input.recipientEmail,
          },
        },
      ],
      items: [
        {
          name: `Pledge: ${input.collectionTitle}`.slice(0, 200),
          quantity: "1",
          unit_amount: { currency_code: input.currency, value: input.amountValue },
        },
      ],
    }),
  );
  const href = (created.href as string | undefined) ?? "";
  const invoiceId = (created.id as string | undefined) ?? href.split("/").pop();
  if (!invoiceId) throw new Error(`Invoice creation failed: ${JSON.stringify(created).slice(0, 300)}`);

  const sent = parse(await raw("send_invoice").execute({ invoice_id: invoiceId, send_to_recipient: true }));
  let qrBase64: string | undefined;
  try {
    const qr = parse(await raw("generate_invoice_qr_code").execute({ invoice_id: invoiceId, width: 300, height: 300 }));
    qrBase64 = (qr.raw as string | undefined) ?? (qr.qr_code as string | undefined);
  } catch {
    /* QR is a nice-to-have */
  }
  return { invoiceId, payLink: (sent.href as string | undefined) ?? undefined, qrBase64 };
}
