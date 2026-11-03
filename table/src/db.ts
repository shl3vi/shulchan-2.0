import pg from "pg";

/** Removed this long after the last change to the table, not after it was created. */
export const TABLE_TTL_MS = 30 * 60 * 1000;

const databaseUrl = process.env.DATABASE_URL ?? "postgres://shulchan:shulchan@127.0.0.1:5432/shulchan";

export const pool = new pg.Pool({ connectionString: databaseUrl });

export async function connectPostgres() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tables (
      id text PRIMARY KEY,
      kind text NOT NULL,
      record jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS tables_expires_at ON tables (expires_at)");
  const column = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tables' AND column_name = 'engine'
    ) AS exists
  `);
  if (!column.rows[0]?.exists) return;
  await pool.query(`
    UPDATE tables
    SET record = jsonb_set(record, '{poker}', engine, true)
    WHERE engine IS NOT NULL AND (record->'poker') IS NULL
  `);
  await pool.query("ALTER TABLE tables DROP COLUMN engine");
}
