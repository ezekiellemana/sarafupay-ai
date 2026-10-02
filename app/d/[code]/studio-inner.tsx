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

function initialState(currency: string): AgReportState {
  const v = (id: string, field: string, title: string, agg: "sum" | "count" = "sum") => ({
    type: "value",
    dataMapping: { value: [{ id: field, aggregation: agg }] },
    format: { title: { enabled: true, text: title } },
  });
  return {
    pages: [
      {
        id: "overview",
        widgets: {
          raised: v("raised", "contributions.amount", `Raised (${currency})`),
          count: v("count", "contributions.payments", "Contributions"),
          paidout: v("paidout", "payouts.amount", `Paid out (${currency})`),
          pledged: v("pledged", "pledges.amount", `Pledged (${currency})`),
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
          ledger: {
            type: "grid",
            dataMapping: {
              cols: [
                { id: "contributions.contributor" },
                { id: "contributions.amount" },
                { id: "contributions.paid_on" },
                { id: "contributions.channel" },
                { id: "contributions.message" },
                { id: "contributions.paypal_ref" },
              ],
            },
            format: { title: { enabled: true, text: "Contributions ledger" } },
          },
          pledgeLedger: {
            type: "grid",
            dataMapping: {
              cols: [
                { id: "pledges.pledger" },
                { id: "pledges.amount" },
                { id: "pledges.due" },
                { id: "pledges.status" },
                { id: "pledges.reminded" },
              ],
            },
            format: { title: { enabled: true, text: "Open pledges" } },
          },
          payouts: {
            type: "grid",
            dataMapping: {
              cols: [
                { id: "payouts.recipient" },
                { id: "payouts.amount" },
                { id: "payouts.purpose" },
                { id: "payouts.status" },
                { id: "payouts.sent_on" },
              ],
            },
            format: { title: { enabled: true, text: "Payouts (transparency ledger)" } },
          },
        },
        widgetLayout: {
          raised: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 5 },
          count: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 5 },
          paidout: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 5 },
          pledged: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 5 },
          byday: { xTrack: 0, yTrack: 5, xSpan: 15, ySpan: 12 },
          bychannel: { xTrack: 15, yTrack: 5, xSpan: 9, ySpan: 12 },
          ledger: { xTrack: 0, yTrack: 17, xSpan: 24, ySpan: 12 },
          pledgeLedger: { xTrack: 0, yTrack: 29, xSpan: 11, ySpan: 12 },
          payouts: { xTrack: 11, yTrack: 29, xSpan: 13, ySpan: 12 },
        },
      },
    ],
    selectedPageId: "overview",
  } as unknown as AgReportState;
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

  const sources = useMemo(
    () => ({
      sources: [
        { id: "contributions", data: data.contributions.length ? data.contributions.map((c) => ({ ...c, payments: 1 })) : [{ contributor: "(none yet)", amount: 0, channel: "-", paid_on: "", message: "", paypal_ref: "", payments: 0 }] },
        { id: "pledges", data: data.pledges.length ? data.pledges : [{ pledger: "(none)", amount: 0, due: "", status: "-", reminded: "no" }] },
        { id: "payouts", data: data.payouts.length ? data.payouts : [{ recipient: "(none yet)", amount: 0, purpose: "", status: "-", sent_on: "" }] },
      ],
    }),
    [data],
  );

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
        initialState={initialState(currency)}
        mode="edit"
        panels={{ edit: { left: ["ai"], right: ["data", "edit"] } } as never}
        ai={ai as never}
      />
    </AgStudioProvider>
  );
}
