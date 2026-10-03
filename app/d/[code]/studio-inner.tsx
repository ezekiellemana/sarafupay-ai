"use client";

import { useMemo } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  createAiHarness,
  directLlmRunner,
  studioTheme,
  type AgAiHarnessSetupParams,
  type AgReportState,
} from "ag-studio";
import { geminiProxyAdapter } from "@/lib/studio/adapter";
import type { StudioProps } from "./studio-dashboard";

const theme = (studioTheme as unknown as { withParams: (p: Record<string, unknown>) => typeof studioTheme }).withParams({
  accentColor: "#0e3b2c",
  backgroundColor: "#fffaf0",
  foregroundColor: "#12261e",
  borderColor: "#d9c9a8",
  fontFamily: "var(--font-onest), sans-serif",
  chartPaletteFills1Color: "#0e3b2c",
  chartPaletteFills2Color: "#f2a516",
  chartPaletteFills3Color: "#c4502f",
  chartPaletteFills4Color: "#2a6f97",
  chartPaletteFills5Color: "#7a9e7e",
  chartPaletteFills6Color: "#d9a679",
  chartPaletteStrokes1Color: "#0e3b2c",
  chartPaletteStrokes2Color: "#c98a0e",
  chartPaletteStrokes3Color: "#9c3d22",
  chartPaletteStrokes4Color: "#1f5575",
  chartPaletteStrokes5Color: "#5c7d60",
  chartPaletteStrokes6Color: "#b88455",
});

function initialState(): AgReportState {
  const kpi = (field: string, title: string, aggregation: "sum" | "count" = "sum") => ({
    type: "value",
    dataMapping: { value: [{ id: field, aggregation }] },
    format: { title: { enabled: true, text: title } },
  });
  const grid = (title: string, cols: string[]) => ({
    type: "grid",
    dataMapping: { cols: cols.map((id) => ({ id })) },
    format: { title: { enabled: true, text: title } },
  });
  return {
    pages: [
      {
        id: "overview",
        widgets: {
          raised: kpi("contributions.amount", "Raised"),
          count: kpi("contributions.contributor", "Contributions", "count"),
          paidout: kpi("payouts.amount", "Paid out"),
          pledged: kpi("pledges.amount", "Pledged"),
          byday: {
            type: "column-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "contributions.paid_on" }],
              valueKey: [{ id: "contributions.amount", aggregation: "sum" }],
            },
            format: { title: { enabled: true, text: "Money in, by day" } },
          },
          bychannel: {
            type: "donut-chart",
            dataMapping: {
              categoryKey: [{ id: "contributions.channel" }],
              valueKey: [{ id: "contributions.amount", aggregation: "sum" }],
            },
            format: { title: { enabled: true, text: "By channel" } },
          },
          ledger: grid("Contributions", [
            "contributions.contributor",
            "contributions.amount",
            "contributions.paid_on",
            "contributions.channel",
            "contributions.message",
            "contributions.paypal_ref",
          ]),
          pledgeLedger: grid("Pledges", ["pledges.pledger", "pledges.amount", "pledges.due", "pledges.status", "pledges.reminded"]),
          payouts: grid("Payouts · transparency ledger", ["payouts.recipient", "payouts.amount", "payouts.purpose", "payouts.status", "payouts.sent_on"]),
        },
        widgetLayout: {
          raised: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 5 },
          count: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 5 },
          paidout: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 5 },
          pledged: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 5 },
          byday: { xTrack: 0, yTrack: 5, xSpan: 16, ySpan: 12 },
          bychannel: { xTrack: 16, yTrack: 5, xSpan: 8, ySpan: 12 },
          ledger: { xTrack: 0, yTrack: 17, xSpan: 24, ySpan: 13 },
          pledgeLedger: { xTrack: 0, yTrack: 30, xSpan: 11, ySpan: 11 },
          payouts: { xTrack: 11, yTrack: 30, xSpan: 13, ySpan: 11 },
        },
      },
    ],
    selectedPageId: "overview",
    // Report first: the data and widget panels start folded away (one click to open).
    panels: { data: { collapsed: true }, edit: { collapsed: true } },
  } as unknown as AgReportState;
}

/** Friendly column names and money formatting, declared up front so empty tables still have a schema. */
function sourceFields(currency: string) {
  let money: Intl.NumberFormat;
  try {
    money = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" });
  } catch {
    money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const text = (id: string, name: string) => ({ id, name, format: "textFormat" });
  const amount = { id: "amount", name: "Amount", format: "currencyFormat", formatOptions: { format: money } };
  const date = (id: string, name: string) => ({
    id,
    name,
    format: "dateFormat",
    accessor: (r: Record<string, string>) => (r[id] ? new Date(`${r[id]}T00:00:00`) : null),
  });
  return {
    contributions: [
      text("contributor", "Contributor"),
      amount,
      date("paid_on", "Paid on"),
      text("channel", "Channel"),
      text("message", "Message"),
      text("paypal_ref", "PayPal ref"),
    ],
    pledges: [text("pledger", "Pledger"), amount, date("due", "Due"), text("status", "Status"), text("reminded", "Reminded")],
    payouts: [text("recipient", "Recipient"), amount, text("purpose", "Purpose"), text("status", "Status"), date("sent_on", "Sent on")],
  };
}

const TREASURER_PROMPT = `You are the SarafuPay Treasurer, an AI analyst for a group collection (michango) dashboard.
Your users are organisers who must account to their community for every shilling/dollar.
- Answer money questions precisely using the data (use execute_query / view_schema), quoting amounts with currency.
- Use collection_summary for headline numbers.
- When asked to build or change charts/pages, delegate to the built-in Studio agents.
- You may send WhatsApp reminders to people with open pledges using remind_pledgers, but only when the organiser explicitly asks.
- You CANNOT move money. Payouts are done in WhatsApp with a one-time CONFIRM code — tell the organiser that if they ask.
- Offer to draft a short, warm transparency update they can paste into their WhatsApp group.`;

export default function StudioInner({ code, ownerKey, currency, data, licenseKey }: StudioProps) {
  const headers = useMemo(() => ({ "x-collection": code, "x-owner-key": ownerKey }), [code, ownerKey]);
  const adapter = useMemo(() => geminiProxyAdapter({ endpoint: "/api/studio/llm", headers }), [headers]);

  const sources = useMemo(() => {
    const fields = sourceFields(currency);
    return {
      sources: [
        { id: "contributions", name: "Contributions", data: data.contributions, fields: fields.contributions },
        { id: "pledges", name: "Pledges", data: data.pledges, fields: fields.pledges },
        { id: "payouts", name: "Payouts", data: data.payouts, fields: fields.payouts },
      ],
    };
  }, [data, currency]);

  const ai = useMemo(
    () => (params: AgAiHarnessSetupParams) => {
      const api = params.api;
      const call = async (action: string) => {
        const res = await fetch("/api/studio/action", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ action }),
        });
        return res.json();
      };
      const summaryTool = api.defineAiTool({
        name: "collection_summary",
        description: "Live headline numbers for this collection from SarafuPay: target, raised, % funded, paid out, balance, open pledges, deadline.",
        params: (s) => s.object({}),
        execute: async (_args, ctx) => ctx.success(JSON.stringify(await call("summary"))),
      });
      const remindTool = api.defineAiTool({
        name: "remind_pledgers",
        description: "Send each person with an open pledge a personal WhatsApp reminder containing their own PayPal pay link. Only when the organiser asks.",
        params: (s) => s.object({}),
        execute: async (_args, ctx) => {
          const r = await call("remind_pledgers");
          return r.ok ? ctx.success(`Reminded: ${(r.reminded ?? []).join(", ") || "nobody"}`, r) : ctx.error(r.error ?? "failed");
        },
      });
      return createAiHarness(api, ({ tools, builtIn }) => ({
        agents: [
          directLlmRunner({
            id: "treasurer",
            name: "Treasurer",
            description: "SarafuPay treasurer: answers money questions, nudges pledgers, delegates dashboard building.",
            adapter,
            instructions: () => TREASURER_PROMPT,
            tools: () => [
              summaryTool,
              remindTool,
              tools.studio.viewSchema(),
              tools.studio.executeQuery(),
              tools.studio.viewPage(),
              tools.delegateTo(["lead", "data", "widget", "page"]),
            ],
          } as never),
          ...Object.values(builtIn).map((definition) => directLlmRunner({ ...definition, adapter })),
        ],
        primary: "treasurer",
        promptStarters: [
          { label: "Who hasn't paid?", prompt: "Which pledges are still open, and how much is outstanding in total?" },
          { label: "Top contributors", prompt: "Add a bar chart of the top 10 contributors by amount." },
          { label: "Transparency update", prompt: "Draft a short WhatsApp transparency update for the group with totals and payouts." },
        ],
      }));
    },
    [adapter, headers],
  );

  return (
    <AgStudioProvider licenseKey={licenseKey || undefined} modules={[AgStudioAiModule]}>
      <AgStudio
        style={{ height: "100%", width: "100%" }}
        theme={theme}
        data={sources as never}
        initialState={initialState()}
        mode="edit"
        panels={{ edit: { left: ["ai"], right: ["data", "edit"] } } as never}
        ai={ai as never}
      />
    </AgStudioProvider>
  );
}
