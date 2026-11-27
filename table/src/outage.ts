import type pg from "pg";
import { pool } from "./db.js";
import { allGames, gameOf, type GameKind } from "./games/index.js";
import { publishTable, redis, TableNotFound, withTable, type TableRecord } from "./store.js";

/**
 * Time nobody could play does not count against a table.
 *
 * Each sweep writes down that the server is working ("server" in the `alive` table), and that each
 * game's engine answers ("engine:<kind>"). When a note is older than GAP_MS, that part was down for
 * the difference: every table it affects gets that time back on its idle fuse, its pause hour, its
 * stored expiry and its game's own clocks, before anything is closed or deleted for being quiet.
 */

/** A sweep runs every 10 seconds. A gap longer than this means the server or an engine was down. */
export const GAP_MS = 30_000;

type Part = "server" | `engine:${GameKind}`;

function engineName(kind: GameKind): Part {
  return `engine:${kind}`;
}

/** Notes every part as working now, unless it already has a note. Run once at startup. */
export async function startAliveNotes() {
  const now = Date.now();
  const names: Part[] = ["server", ...allGames().map(([kind]) => engineName(kind))];
  for (const name of names) {
    await pool.query("INSERT INTO alive (name, at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [name, now]);
  }
}

/** Moves one table's clocks forward by `gap`. Times in the past never move past `now`. */
export function shiftTable(table: TableRecord, gap: number, now: number) {
  if (table.closing || gap <= 0) return;
  const later = (at: number) => Math.min(now, at + gap);
  if (table.lastActivityAt != null) table.lastActivityAt = later(table.lastActivityAt);
  if (table.pausedAt != null) table.pausedAt = later(table.pausedAt);
  if (table.adminAwaySince != null) table.adminAwaySince = later(table.adminAwaySince);
  // The sweep works the warning out again from the moved last move.
  delete table.idleCloseAt;
  gameOf(table).shift?.(table, gap);
}

/** Gives `gap` back to every table that was open when the outage began, or only to one game's tables. */
async function shiftTables(gap: number, since: number, kind: GameKind | null) {
  // A table whose expiry passed while nothing could reach it is brought back first.
  const found = await pool.query<{ id: string }>(
    `UPDATE tables SET expires_at = expires_at + make_interval(secs => $1::double precision)
     WHERE expires_at > to_timestamp($2::double precision / 1000) AND ($3::text IS NULL OR kind = $3)
     RETURNING id`,
    [gap / 1000, since, kind],
  );
  for (const { id } of found.rows) {
    try {
      await withTable(id, async (table) => {
        shiftTable(table, gap, Date.now());
      });
      await publishTable(id);
    } catch (error) {
      if (error instanceof TableNotFound) continue;
      console.error("Outage catch-up failed for a table", id, error instanceof Error ? error.message : error);
    }
  }
  if (found.rows.length > 0) {
    console.warn(`${kind ?? "server"} was down for ${Math.round(gap / 1000)}s: gave the time back to ${found.rows.length} tables`);
  }
}

/**
 * Reads the note for `name` with a row lock, so only one table process gives the time back.
 * Returns false when another process holds the lock: it is catching up right now.
 */
async function withNote(name: Part, run: (client: pg.PoolClient, at: number) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query<{ at: string }>("SELECT at FROM alive WHERE name = $1 FOR UPDATE SKIP LOCKED", [name]);
    if (!row.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    await run(client, Number(row.rows[0].at));
    await client.query("UPDATE alive SET at = $2 WHERE name = $1", [name, Date.now()]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run before anything that closes or deletes tables. Returns false when that must wait: Redis or
 * Postgres is still out (it throws), or another table process is giving tables their time back.
 */
export async function catchUpServer() {
  // Moves need Redis as much as Postgres, so the server only counts as working when both answer.
  await redis.ping();
  return withNote("server", async (client, at) => {
    const gap = Date.now() - at;
    if (gap <= GAP_MS) return;
    // Every engine lost the same time, given here once. Its own note must not give it again.
    // First, so a failure here leaves no table shifted, and the next sweep tries the whole thing again.
    await client.query("UPDATE alive SET at = at + $1 WHERE name <> 'server'", [gap]);
    await shiftTables(gap, at, null);
  });
}

let lastDown = new Set<GameKind>();

/** The games found down by the last check. The expiry pass keeps their tables. */
export function downGames() {
  return [...lastDown];
}

/**
 * Checks every game's engine. One that answers gets its own outage given back to its tables.
 * Returns the games whose tables must not be closed, deleted or timed out right now.
 */
export async function enginesDown() {
  const down = new Set<GameKind>();
  await Promise.all(allGames().map(async ([kind, game]) => {
    if (!(await game.health())) {
      down.add(kind);
      return;
    }
    const done = await withNote(engineName(kind), async (_client, at) => {
      const gap = Date.now() - at;
      if (gap > GAP_MS) await shiftTables(gap, at, kind);
    });
    if (!done) down.add(kind);
  }));
  lastDown = down;
  return down;
}
