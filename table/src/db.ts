import pg from "pg";

export const TABLE_TTL_MS = 5 * 60 * 60 * 1000;

const databaseUrl = process.env.DATABASE_URL ?? "postgres://shulchan:shulchan@127.0.0.1:5432/shulchan";

export const pool = new pg.Pool({ connectionString: databaseUrl });

export async function connectPostgres() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tables (
      id text PRIMARY KEY,
      kind text NOT NULL,
      record jsonb NOT NULL,
      engine jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS tables_expires_at ON tables (expires_at)");
}

export function secondsUntil(expiresAt: Date) {
  return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}
