import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { env } from "../env";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Promise<DB> };
const g = globalThis as unknown as { __sarafuDb?: Holder };
const holder: Holder = (g.__sarafuDb ??= {});

async function create(): Promise<DB> {
  const url = env.databaseUrl();
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : "require";
    const client = postgres(url, { max: 5, ssl: ssl as never, onnotice: () => {} });
    await client.unsafe(BOOTSTRAP_SQL);
    return drizzle(client, { schema }) as unknown as DB;
  }
  // Zero-setup local mode: embedded Postgres (PGlite) persisted to disk.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = env.pgliteDir();
  if (dir !== "memory") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  await client.exec(BOOTSTRAP_SQL);
  return drizzle(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  holder.db ??= create().catch((e) => {
    holder.db = undefined;
    throw e;
  });
  return holder.db;
}

export { schema };
