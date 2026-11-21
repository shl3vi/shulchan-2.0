import { createClient, type RedisClientType } from "redis";
import { connectPostgres, pool, TABLE_TTL_MS } from "./db.js";
import type { GameKind } from "./games/index.js";
import type { EngineView } from "./games/poker/engine.js";
import type { TurnClock } from "./games/poker/turn.js";

export type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
  /** Stable across tables, so a block still applies the next time these two sit together. */
  personKey?: string;
  seat: number;
  /** Poker only. Chips bought so far. */
  bought?: number;
  pendingRemoval?: boolean;
  /** Joined from a browser. A browser player is a guest and is never made admin. */
  web?: boolean;
};

export type RebuyRule = "any" | "busted" | "off";

export type TableRecord = {
  id: string;
  adminId?: string;
  /** Server time the admin was first seen disconnected. See admin.ts. */
  adminAwaySince?: number;
  adminSecret?: string;
  smallBlind: number;
  buyIn: number;
  password: string;
  hostEmail?: string;
  /** Poker only. The next hand starts on its own once the table is waiting. */
  autoDeal?: boolean;
  kind?: GameKind;
  backgammon?: unknown;
  backgammonLog?: { whiteName: string; blackName: string; winner: "white" | "black"; points: number }[];
  poker?: unknown;
  pokerView?: EngineView;
  /** Bumped on every saved change, so a restart cannot revive an older hand. */
  revision?: number;
  /** Server time of the last real game action. The idle fuse is measured from here. */
  lastActivityAt?: number;
  /** Admin pause. Video is off and the idle fuse is frozen, not reset. */
  paused?: boolean;
  idleCarry?: number;
  /** Server time at which an idle table closes. Absent unless the warning is showing. */
  idleCloseAt?: number;
  /** Set once the idle fuse has burned out, so a late action cannot save the table. */
  closing?: boolean;
  /** Bumped on each pause so a token issued before the pause cannot rejoin. */
  mediaEpoch?: number;
  /** Poker only. The seat to act and when the server acts for them. */
  turn?: TurnClock;
  /** Poker only. Who may buy more chips: anyone at any time (the default), only a player with none left, or nobody. */
  rebuy?: RebuyRule;
  /** Poker only. Seconds each player has to act. Set from the region's config, changed by the admin. */
  turnSeconds?: number;
  players: SeatPlayer[];
};

/** A table about to be stored for the first time. Its game is always known. */
export type KindedTable = TableRecord & { kind: GameKind };

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis: RedisClientType = createClient({ url: redisUrl });
export const subscriber: RedisClientType = createClient({ url: redisUrl });

export async function connectRedis() {
  await redis.connect();
  await subscriber.connect();
  await connectPostgres();
  await adoptLiveRedis();
  await expireTables();
  expiryTimer = setInterval(() => {
    void expireTables().catch((error) => {
      console.error("Table expiry failed", error instanceof Error ? error.message : error);
    });
  }, 60_000);
  expiryTimer.unref();
}

let expiryTimer: NodeJS.Timeout | undefined;

export function stopStore() {
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = undefined;
}

export function pokerKey(id: string) {
  return `poker:${id}`;
}

export function tableKey(id: string) {
  return `table:${id}`;
}

async function scan(match: string) {
  const keys: string[] = [];
  for await (const key of redis.scanIterator({ MATCH: match, COUNT: 100 })) {
    keys.push(String(key));
  }
  return keys;
}

/**
 * Redis used to hold the live hand, with Postgres catching up afterwards.
 * Keep the newer of those two copies, then leave the hand only in Postgres.
 */
async function adoptLiveRedis() {
  for (const key of await scan("poker:*")) {
    const id = key.slice("poker:".length);
    const raw = await redis.get(key);
    if (raw) {
      const found = await pool.query<{ record: TableRecord }>(
        "SELECT record FROM tables WHERE id = $1 AND expires_at > now()",
        [id],
      );
      const table = found.rows[0]?.record;
      if (table && !table.poker) {
        table.poker = JSON.parse(raw) as unknown;
        table.revision = (table.revision ?? 0) + 1;
        await pool.query(
          "UPDATE tables SET record = $2::jsonb, updated_at = now() WHERE id = $1 AND expires_at > now()",
          [id, JSON.stringify(table)],
        );
      }
    }
    await redis.del(key);
  }
  for (const key of await scan("table:*")) {
    const id = key.slice("table:".length);
    const raw = await redis.get(key);
    if (raw) {
      const cached = JSON.parse(raw) as TableRecord;
      const found = await pool.query<{ record: TableRecord }>(
        "SELECT record FROM tables WHERE id = $1 AND expires_at > now()",
        [id],
      );
      const saved = found.rows[0]?.record;
      if (saved && saved.revision == null && cached.revision == null) {
        cached.revision = 1;
        await pool.query(
          "UPDATE tables SET record = $2::jsonb, updated_at = now() WHERE id = $1 AND expires_at > now()",
          [id, JSON.stringify(cached)],
        );
      }
    }
    await redis.del(key);
  }
}

export async function readTable(id: string) {
  const found = await pool.query<{ record: TableRecord }>(
    "SELECT record FROM tables WHERE id = $1 AND expires_at > now()",
    [id],
  );
  return found.rows[0]?.record ?? null;
}

/** Moves are written before they return, so shutdown has nothing left to flush. */
export async function flushTables() {
  return;
}

/** The table changed after this copy was read. The copy must be dropped, not saved. */
export class TableConflict extends Error {
  constructor() {
    super("Table changed while saving");
  }
}

/**
 * Saves only if the stored record is still the revision this copy was read at.
 * The Redis lock can expire under a slow engine call, and without this check a late
 * write would erase whatever was saved in between.
 */
export async function writeTable(table: TableRecord) {
  const read = table.revision ?? 0;
  table.revision = read + 1;
  const saved = await pool.query(
    `UPDATE tables
     SET record = $2::jsonb, updated_at = now(), expires_at = now() + make_interval(secs => $3::int)
     WHERE id = $1 AND expires_at > now() AND COALESCE((record->>'revision')::int, 0) = $4`,
    [table.id, JSON.stringify(table), TABLE_TTL_MS / 1000, read],
  );
  if (saved.rowCount === 1) return;
  table.revision = read;
  if (await readTable(table.id)) throw new TableConflict();
  throw new TableNotFound();
}

export const OPEN_TABLE_CAP = 2;

export async function openTableCount(email: string) {
  const open = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM tables WHERE expires_at > now() AND record->>'hostEmail' = $1",
    [email],
  );
  return Number(open.rows[0]?.count ?? 0);
}

export class HostTableLimit extends Error {
  constructor() {
    super("You already have two tables open");
  }
}

/** One host cannot pass the cap twice at the same moment. The lock covers the count and the insert. */
export async function insertHostTable(table: KindedTable) {
  const email = table.hostEmail ?? "";
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`open-tables:${email}`]);
    if (await openTableCount(email) >= OPEN_TABLE_CAP) throw new HostTableLimit();
    table.revision = 1;
    const saved = await client.query(
      `INSERT INTO tables (id, kind, record, expires_at)
       VALUES ($1, $2, $3::jsonb, now() + make_interval(secs => $4::int))
       ON CONFLICT (id) DO UPDATE
         SET kind = EXCLUDED.kind,
             record = EXCLUDED.record,
             created_at = now(),
             expires_at = EXCLUDED.expires_at,
             updated_at = now()
         WHERE tables.expires_at <= now()
       RETURNING id`,
      [table.id, table.kind, JSON.stringify(table), TABLE_TTL_MS / 1000],
    );
    return saved.rowCount === 1;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`open-tables:${email}`]).catch(() => undefined);
    client.release();
  }
}

export async function insertTable(table: KindedTable) {
  table.revision = 1;
  const saved = await pool.query(
    `INSERT INTO tables (id, kind, record, expires_at)
     VALUES ($1, $2, $3::jsonb, now() + make_interval(secs => $4::int))
     ON CONFLICT (id) DO UPDATE
       SET kind = EXCLUDED.kind,
           record = EXCLUDED.record,
           created_at = now(),
           expires_at = EXCLUDED.expires_at,
           updated_at = now()
       WHERE tables.expires_at <= now()
     RETURNING id`,
    [table.id, table.kind, JSON.stringify(table), TABLE_TTL_MS / 1000],
  );
  return saved.rowCount === 1;
}

/** Once a host has no table left, their sign-in email does not stay in Redis. */
async function releaseHost(email: string | null | undefined) {
  if (!email || email === "signed-in") return;
  const still = await pool.query(
    "SELECT 1 FROM tables WHERE expires_at > now() AND record->>'hostEmail' = $1 LIMIT 1",
    [email],
  );
  if (still.rowCount) return;
  const keys: string[] = [];
  for (const key of await scan("host:*")) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const host = JSON.parse(raw) as { email?: string };
      if (host.email === email) keys.push(key);
    } catch {
      // not a host session
    }
  }
  if (keys.length > 0) await redis.del(keys);
}

/** Drops every open table for this sign-in, then every host token that carries the same email. */
export async function deleteHostAccount(email: string, token: string) {
  const ids: string[] = [];
  if (email && email !== "signed-in") {
    const deleted = await pool.query<{ id: string }>(
      `DELETE FROM tables WHERE expires_at > now() AND record->>'hostEmail' = $1 RETURNING id`,
      [email],
    );
    for (const row of deleted.rows) ids.push(row.id);
    if (ids.length > 0) {
      await redis.del(ids.flatMap((id) => [tableKey(id), pokerKey(id), `ledger:${id}`]));
    }
    const keys: string[] = [];
    for (const key of await scan("host:*")) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const host = JSON.parse(raw) as { email?: string };
        if (host.email === email) keys.push(key);
      } catch {
        // not a host session
      }
    }
    if (keys.length > 0) await redis.del(keys);
  }
  await redis.del(`host:${token}`);
  if (ids.length > 0) await onExpired(ids);
}

export async function listOpenTables() {
  const found = await pool.query<{ id: string; record: TableRecord }>(
    "SELECT id, record FROM tables WHERE expires_at > now()",
  );
  return found.rows;
}

/** A paused table is meant to stay. Refresh it only as its existing lifetime runs down. */
export async function extendPausedTables() {
  await pool.query(
    `UPDATE tables
     SET expires_at = now() + make_interval(secs => $1::int)
     WHERE expires_at > now()
       AND expires_at < now() + interval '10 minutes'
       AND record->>'paused' = 'true'
       AND COALESCE(record->>'closing', '') <> 'true'`,
    [TABLE_TTL_MS / 1000],
  );
}

export async function removeTable(id: string) {
  const deleted = await pool.query<{ email: string | null }>(
    `DELETE FROM tables WHERE id = $1 RETURNING record->>'hostEmail' AS email`,
    [id],
  );
  await redis.del([tableKey(id), pokerKey(id), `ledger:${id}`]);
  await releaseHost(deleted.rows[0]?.email);
}

let onExpired: (ids: string[]) => Promise<void> = async () => {};

export function whenTablesExpire(handler: (ids: string[]) => Promise<void>) {
  onExpired = handler;
}

async function expireTables() {
  const expired = await pool.query<{ id: string; email: string | null }>(
    `DELETE FROM tables WHERE expires_at < now() RETURNING id, record->>'hostEmail' AS email`,
  );
  if (expired.rows.length === 0) return;
  await redis.del(expired.rows.flatMap((row) => [tableKey(row.id), pokerKey(row.id)]));
  const emails = [...new Set(expired.rows.map((row) => row.email).filter((email): email is string => !!email))];
  for (const email of emails) await releaseHost(email);
  await onExpired(expired.rows.map((row) => row.id));
}

/** Returned from withTable's callback when the record must not be written. */
export const TABLE_UNCHANGED = Symbol("table-unchanged");

const releaseLock = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`;

export class TableNotFound extends Error {
  constructor() {
    super("Game not found");
  }
}

const LOCK_MS = 5000;
/** A save refused on revision runs the change again on the newer table, this many times in all. */
const CONFLICT_TRIES = 3;

// Every change to a table record goes through here, so concurrent joins, leaves, and admin moves cannot overwrite each other.
// The lock keeps changes in line; the revision check in writeTable is what makes a lost update impossible.
// `run` can be called again after a conflict, so it must only change the table it is given.
export async function withTable<T>(id: string, run: (table: TableRecord) => Promise<T>): Promise<T> {
  const lock = `lock:table:${id}`;
  let conflicts = 0;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const token = crypto.randomUUID();
    if (await redis.set(lock, token, { NX: true, PX: LOCK_MS })) {
      try {
        const table = await readTable(id);
        if (!table) throw new TableNotFound();
        const result = await run(table);
        if (result === TABLE_UNCHANGED) return result;
        await writeTable(table);
        return result;
      } catch (error) {
        if (!(error instanceof TableConflict)) throw error;
        conflicts += 1;
        console.error("Table save conflict", id, `try ${conflicts} of ${CONFLICT_TRIES}`);
        if (conflicts >= CONFLICT_TRIES) throw new Error("Table is busy");
        continue;
      } finally {
        await redis.eval(releaseLock, { keys: [lock], arguments: [token] });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Table is busy");
}

export async function publishTable(id: string) {
  await redis.publish("tables", id);
}
