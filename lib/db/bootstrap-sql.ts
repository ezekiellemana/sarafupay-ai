// Idempotent DDL, run once per process. Kept in sync with schema.ts by hand
// (small schema, avoids a migration step on Render and for judges running locally).
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  name text,
  channel text NOT NULL,
  paypal_email text,
  active_collection_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS collections (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  title text NOT NULL,
  purpose text,
  category text NOT NULL DEFAULT 'other',
  target_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  deadline text,
  payout_email text,
  status text NOT NULL DEFAULT 'active',
  owner_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contributions (
  id text PRIMARY KEY,
  collection_id text NOT NULL,
  contributor_id text,
  display_name text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL,
  message text,
  paypal_order_id text,
  paypal_capture_id text,
  payer_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS contrib_collection_idx ON contributions (collection_id);
CREATE INDEX IF NOT EXISTS contrib_order_idx ON contributions (paypal_order_id);
CREATE TABLE IF NOT EXISTS pledges (
  id text PRIMARY KEY,
  collection_id text NOT NULL,
  user_id text,
  display_name text NOT NULL,
  amount_cents integer NOT NULL,
  due_date text,
  status text NOT NULL DEFAULT 'open',
  invoice_id text,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payouts (
  id text PRIMARY KEY,
  collection_id text NOT NULL,
  requested_by text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'awaiting_confirmation',
  confirm_code text NOT NULL,
  paypal_batch_id text,
  paypal_item_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
CREATE TABLE IF NOT EXISTS chat_log (
  id serial PRIMARY KEY,
  phone text NOT NULL,
  direction text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_phone_idx ON chat_log (phone, id);
`;
