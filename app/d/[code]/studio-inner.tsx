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
  chromeBackgroundColor: "#f6efe0",
  widgetBackgroundColor: "#ffffff",
  widgetBorderColor: "#eadfc8",
  widgetBorderRadius: 14,
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

const INK = "#12261e";
const MUTED = "#5b6b62";
const FOREST = "#0e3b2c";
const GOLD = "#c98a0e";

function initialState(target: number, currency: string): AgReportState {
  let goal = String(target);
  try {
    goal = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(target);
  } catch {}
  // KPI tile: small muted label on top, big bold number below.
  const kpi = (field: string, title: string, opts: { aggregation?: "sum" | "count"; color?: string; sparkline?: boolean } = {}) => ({
    type: "value",
    dataMapping: {
      value: [{ id: field, aggregation: opts.aggregation ?? "sum" }],
      ...(opts.sparkline ? { sparklineX: [{ id: "contributions.paid_on" }] } : {}),
    },
    format: {
      title: { enabled: true, text: title, typography: { fontSize: 13, fontWeight: "normal" }, color: MUTED },
      style: {
        typography: { fontSize: 30, fontWeight: "bold" },
        color: opts.color ?? INK,
        verticalAlign: "bottom",
        ...(opts.sparkline ? { sparkline: { type: "line", lineWidth: 2, areaFill: true } } : {}),
      },
      widget: { borderRadius: 14 },
    },
  });
  const grid = (title: string, cols: string[], subtitle?: string) => ({
    type: "grid",
    dataMapping: { cols: cols.map((id) => ({ id })) },
    format: {
      title: { enabled: true, text: title, typography: { fontSize: 16, fontWeight: "bold" }, color: INK },
      ...(subtitle ? { subtitle: { enabled: true, text: subtitle, typography: { fontSize: 12 }, color: MUTED } } : {}),
      style: {
        columnAutoSize: true,
        theme: { rowHeight: 34, rowBorder: { color: "#eadfc8", width: 1 } },
        grandTotalRow: { enabled: true, borderColor: "#d9c9a8", borderWidth: 1 },
      },
      widget: { borderRadius: 14 },
    },
  });
  const chartTitle = (text: string, subtitle?: string) => ({
    title: { enabled: true, text, typography: { fontSize: 16, fontWeight: "bold" }, color: INK },
    ...(subtitle ? { subtitle: { enabled: true, text: subtitle, typography: { fontSize: 12 }, color: MUTED } } : {}),
    widget: { borderRadius: 14 },
  });
  return {
    pages: [
      {
        id: "overview",
        widgets: {
          raised: kpi("contributions.amount", "Raised", { color: FOREST, sparkline: true }),
          funded: kpi("summary.funded", "Of target"),
          balance: kpi("summary.balance", "Balance to pay out", { color: GOLD }),
          paidout: kpi("summary.paid_out", "Paid out"),
          pledged: kpi("summary.open_pledges", "Open pledges"),
          count: kpi("contributions.contributor", "Contributions", { aggregation: "count" }),
          gauge: {
            type: "radial-gauge",
            dataMapping: { value: [{ id: "summary.raised", aggregation: "sum" }] },
            format: {
              ...chartTitle("Progress to target", target > 0 ? `Goal ${goal}` : undefined),
              style: {
                scaleLabel: { enabled: false, min: 0, max: target > 0 ? target : undefined },
                label: { enabled: true, color: FOREST },
                secondaryLabel: { enabled: true, text: "raised so far", color: MUTED },
              },
            },
          },
          byday: {
            type: "column-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "contributions.paid_on" }],
              valueKey: [{ id: "contributions.amount", aggregation: "sum" }],
            },
            format: {
              ...chartTitle("Money in, by day", "Captured PayPal contributions per day"),
              style: {
                theme: { common: { legend: { enabled: false } } },
                custom: {
                  categoryAxisMode: "categorical",
                  valueAxis: { gridLine: { enabled: true, style: { stroke: "#eadfc8" } } },
                },
              },
            },
          },
          bychannel: {
            type: "donut-chart",
            dataMapping: {
              categoryKey: [{ id: "contributions.channel" }],
              valueKey: [{ id: "contributions.amount", aggregation: "sum" }],
            },
            format: {
              ...chartTitle("By channel", "WhatsApp chat vs. web checkout"),
              style: {
                theme: { common: { legend: { enabled: true, position: "bottom" } } },
                custom: {
                  pieDataLabel: { enabled: true, format: "percent", position: "outside", category: true, fontSize: 12 },
                  totalLabel: { enabled: true, fontSize: 18, fontWeight: "bold", color: INK },
                },
              },
            },
          },
          ledger: grid(
            "Contributions",
            ["contributions.contributor", "contributions.amount", "contributions.paid_on", "contributions.channel", "contributions.message", "contributions.paypal_ref"],
            "Every captured payment, with its PayPal reference",
          ),
          top: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "contributions.contributor" }],
              valueKey: [{ id: "contributions.amount", aggregation: "sum" }],
            },
            sort: [{ field: { id: "contributions.amount", aggregation: "sum" }, direction: "desc" }],
            format: {
              ...chartTitle("Top contributors"),
              style: {
                theme: { common: { legend: { enabled: false } } },
                custom: { valueAxis: { gridLine: { enabled: true, style: { stroke: "#eadfc8" } } } },
              },
            },
          },
          pledgeLedger: grid("Pledges", ["pledges.pledger", "pledges.amount", "pledges.due", "pledges.status", "pledges.reminded"], "Promises still to be paid"),
          payouts: grid(
            "Payouts · transparency ledger",
            ["payouts.recipient", "payouts.amount", "payouts.purpose", "payouts.status", "payouts.sent_on"],
            "Broadcast to every contributor and shown on the public page",
          ),
        },
        widgetLayout: {
          raised: { xTrack: 0, yTrack: 0, xSpan: 4, ySpan: 6 },
          funded: { xTrack: 4, yTrack: 0, xSpan: 4, ySpan: 6 },
          balance: { xTrack: 8, yTrack: 0, xSpan: 4, ySpan: 6 },
          paidout: { xTrack: 12, yTrack: 0, xSpan: 4, ySpan: 6 },
          pledged: { xTrack: 16, yTrack: 0, xSpan: 4, ySpan: 6 },
          count: { xTrack: 20, yTrack: 0, xSpan: 4, ySpan: 6 },
          gauge: { xTrack: 0, yTrack: 6, xSpan: 6, ySpan: 12 },
          byday: { xTrack: 6, yTrack: 6, xSpan: 11, ySpan: 12 },
          bychannel: { xTrack: 17, yTrack: 6, xSpan: 7, ySpan: 12 },
          ledger: { xTrack: 0, yTrack: 18, xSpan: 16, ySpan: 17 },
          top: { xTrack: 16, yTrack: 18, xSpan: 8, ySpan: 17 },
          pledgeLedger: { xTrack: 0, yTrack: 35, xSpan: 11, ySpan: 13 },
          payouts: { xTrack: 11, yTrack: 35, xSpan: 13, ySpan: 13 },
        },
      },
    ],
    selectedPageId: "overview",
    // Report first: the data and widget panels start folded away (one click to open).
    panels: { data: { collapsed: true }, edit: { collapsed: true } },
  } as unknown as AgReportState;
}

/** Coloured status pills for the ledgers (open, paid, success, processing, failed, yes/no). */
const PILL: Record<string, [string, string]> = {
  open: ["#fdf0d5", "#8a5a00"],
  paid: ["#dff1e7", "#0e5a3a"],
  fulfilled: ["#dff1e7", "#0e5a3a"],
  success: ["#dff1e7", "#0e5a3a"],
  processing: ["#e3eef6", "#1f5575"],
  pending: ["#e3eef6", "#1f5575"],
  failed: ["#f8e1da", "#9c3d22"],
  unclaimed: ["#f8e1da", "#9c3d22"],
  cancelled: ["#eee9e0", "#5b6b62"],
  yes: ["#dff1e7", "#0e5a3a"],
  no: ["#eee9e0", "#5b6b62"],
  chat: ["#e6efe9", "#0e3b2c"],
  whatsapp: ["#dcf5e3", "#0b6b3a"],
  web: ["#fdf0d5", "#8a5a00"],
};
const PILL_FIELDS = new Set(["status", "reminded", "channel"]);

/** Keep every default widget; give the grid our pill renderer for status-like columns. */
function withStatusPills(config: { widgets: Array<{ id: string; options?: Record<string, unknown> }> }) {
  return {
    ...config,
    widgets: config.widgets.map((w) => (w.id === "grid" ? { ...w, options: { ...(w.options ?? {}), createCellRenderer } } : w)),
  };
}

function createCellRenderer(field: { fieldId?: unknown; externalId?: unknown }) {
  const leaf = String(field?.externalId ?? field?.fieldId ?? "").split(".").pop() ?? "";
  if (!PILL_FIELDS.has(leaf)) return undefined;
  return StatusPill;
}

function StatusPill(params: { value?: unknown; valueFormatted?: string | null }) {
  const raw = params.valueFormatted ?? (params.value == null ? "" : String(params.value));
  if (!raw) return null;
  const [bg, fg] = PILL[raw.toLowerCase()] ?? ["#eee9e0", "#12261e"];
  return (
    <span
      style={{ background: bg, color: fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}
    >
      {raw}
    </span>
  );
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
    summary: [
      { id: "target", name: "Target", format: "currencyFormat", formatOptions: { format: money } },
      { id: "raised", name: "Raised", format: "currencyFormat", formatOptions: { format: money } },
      { id: "funded", name: "% of target", format: "percentageFormat", formatOptions: { format: new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }) } },
      { id: "balance", name: "Balance to pay out", format: "currencyFormat", formatOptions: { format: money } },
      { id: "paid_out", name: "Paid out", format: "currencyFormat", formatOptions: { format: money } },
      { id: "open_pledges", name: "Open pledges", format: "currencyFormat", formatOptions: { format: money } },
    ],
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
        { id: "summary", name: "Summary", data: data.summary, fields: fields.summary },
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
          { label: "Will we hit the target?", prompt: "At the current pace, will we reach the target before the deadline? Show the numbers." },
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
        initialState={initialState(data.summary[0]?.target ?? 0, currency)}
        widgets={withStatusPills as never}
        mode="edit"
        panels={{ edit: { left: ["ai"], right: ["data", "edit"] } } as never}
        ai={ai as never}
      />
    </AgStudioProvider>
  );
}
