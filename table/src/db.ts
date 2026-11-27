import pg from "pg";

/** Removed this long after the last change to the table, not after it was created. */
export const TABLE_TTL_MS = 30 * 60 * 1000;

const databaseUrl = process.env.DATABASE_URL ?? "postgres://shulchan:shulchan@127.0.0.1:5432/shulchan";

/**
 * A table change holds a 5 second lock, so no query may take longer than that.
 * Without these limits a stuck query, or waiting for a free connection when all ten
 * are busy, could hold the table until the lock expires.
 */
export const pool = new pg.Pool({
  connectionString: databaseUrl,
  // Postgres cancels a statement that runs longer than this, and releases what it locked.
  statement_timeout: 3000,
  // The client stops waiting a little later, in case the server never answers at all.
  query_timeout: 4000,
  // Waiting for a connection from the pool, or opening a new one.
  connectionTimeoutMillis: 3000,
});

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker text NOT NULL,
      blocked text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (blocker, blocked)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id text PRIMARY KEY,
      table_id text NOT NULL,
      reporter_key text NOT NULL,
      reporter_name text NOT NULL,
      reported_key text NOT NULL,
      reported_name text NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // A host's sign-in on one device. Only a hash of the token is kept, so a copy of the database cannot sign anyone in.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS host_sessions (
      token_hash text PRIMARY KEY,
      sub text NOT NULL,
      email text NOT NULL,
      name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS host_sessions_email ON host_sessions (email)");
  await pool.query("CREATE INDEX IF NOT EXISTS host_sessions_expires_at ON host_sessions (expires_at)");
  // Apple sends the email only on the first sign-in, so it has to outlive any one session.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apple_accounts (
      sub text PRIMARY KEY,
      email text NOT NULL,
      name text,
      refresh_token text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // The last time each part could take moves: "server", and "engine:<kind>" for each game's engine.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alive (
      name text PRIMARY KEY,
      at bigint NOT NULL
    )
  `);
}
