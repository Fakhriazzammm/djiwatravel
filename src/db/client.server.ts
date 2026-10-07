import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../drizzle/schema";

type DatabaseGlobal = typeof globalThis & { __djiwaTravelPool?: Pool };
const globalForDatabase = globalThis as DatabaseGlobal;
const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required for server-side database access");

export const pool =
  globalForDatabase.__djiwaTravelPool ??
  new Pool({
    connectionString,
    max: Number.parseInt(process.env["DATABASE_POOL_MAX"] ?? "8", 10),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
if (process.env["NODE_ENV"] !== "production") globalForDatabase.__djiwaTravelPool = pool;

export const db = drizzle(pool, { schema });
