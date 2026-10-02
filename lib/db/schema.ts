import { pgTable, text, integer, timestamp, serial, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // E.164 digits for WhatsApp users, "sim:<digits>" for simulator users.
  phone: text("phone").notNull().unique(),
  name: text("name"),
  channel: text("channel").notNull(), // 'whatsapp' | 'sim'
  paypalEmail: text("paypal_email"),
  activeCollectionId: text("active_collection_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collections = pgTable("collections", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose"),
  category: text("category").notNull().default("other"),
  targetCents: integer("target_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  deadline: text("deadline"), // YYYY-MM-DD
  payoutEmail: text("payout_email"),
  status: text("status").notNull().default("active"), // active | closed
  ownerKey: text("owner_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id").notNull(),
    contributorId: text("contributor_id"),
    displayName: text("display_name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | failed | refunded
    source: text("source").notNull(), // whatsapp | sim | web
    message: text("message"),
    paypalOrderId: text("paypal_order_id"),
    paypalCaptureId: text("paypal_capture_id"),
    payerEmail: text("payer_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("contrib_collection_idx").on(t.collectionId), index("contrib_order_idx").on(t.paypalOrderId)],
);

export const pledges = pgTable("pledges", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull(),
  userId: text("user_id"),
  displayName: text("display_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: text("due_date"),
  status: text("status").notNull().default("open"), // open | fulfilled | cancelled
  invoiceId: text("invoice_id"),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  note: text("note"),
  // awaiting_confirmation | processing | success | failed | cancelled
  status: text("status").notNull().default("awaiting_confirmation"),
  confirmCode: text("confirm_code").notNull(),
  paypalBatchId: text("paypal_batch_id"),
  paypalItemId: text("paypal_item_id"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
});

// Every message in and out of the bot, per phone. Doubles as agent memory and simulator inbox.
export const chatLog = pgTable(
  "chat_log",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    direction: text("direction").notNull(), // in | out
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_phone_idx").on(t.phone, t.id)],
);

export type User = typeof users.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type Pledge = typeof pledges.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
