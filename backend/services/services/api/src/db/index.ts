import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as schema from "./schema";

dotenv.config();

function optionalNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSslConfig() {
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(),
  max: optionalNumber(process.env.DATABASE_POOL_MAX, 10),
  idleTimeoutMillis: optionalNumber(
    process.env.DATABASE_IDLE_TIMEOUT_MS,
    30_000,
  ),
  connectionTimeoutMillis: optionalNumber(
    process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    5_000,
  ),
});

pool.on("error", (error) => {
  console.error("Unexpected database pool error", error);
});

export const db = drizzle(pool, { schema });
