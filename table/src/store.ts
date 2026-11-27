import { createClient, type RedisClientType } from "redis";
import { connectPostgres, pool, TABLE_TTL_MS } from "./db.js";
import { copyRedisSignIns, deleteHostSessions, purgeExpiredSessions } from "./signIns.js";
import type { GameKind } from "./games/index.js";

export type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
  /** Stable across tables, so a block still applies the next time these two sit together. */
  personKey?: string;
  seat: number;
  pendingRemoval?: boolean;
  /** Joined from a browser. A browser player is a guest and is never made admin. */
  web?: boolean;
};

/** The game's own part of the table. Only that game's folder reads inside it. */
export type GameState = { kind: GameKind };

/** Records without this version are from before games had their own state, and are deleted. */
export const RECORD_VERSION = 2;

export type TableRecord = {
  v: typeof RECORD_VERSION;
  id: string;
  adminId?: string;
  /** Server time the admin was first seen disconnected. See admin.ts. */
  adminAwaySince?: number;
  adminSecret?: string;
  password: string;
  hostEmail?: string;
  /** Bumped on every saved change, so a restart cannot revive an older hand. */
  revision?: number;
  /** Server time of the last real game action. The idle fuse is measured from here. */
  lastActivityAt?: number;
  /** Admin pause. Video is off and the idle fuse is frozen, not reset. */
  paused?: boolean;
  /** Server time the current pause began. A paused table closes an hour after it. See idle.ts. */
  pausedAt?: number;
  idleCarry?: number;
  /** Server time at which an idle table closes. Absent unless the warning is showing. */
  idleCloseAt?: number;
  /** Set once the idle fuse has burned out, so a late action cannot save the table. */
  closing?: boolean;
  /** Bumped on each pause so a token issued before the pause cannot rejoin. */
  mediaEpoch?: number;
  players: SeatPlayer[];
  game: GameState;
};

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis: RedisClientType = createClient({ url: redisUrl });
export const subscriber: RedisClientType = createClient({ url: redisUrl });

export async function connectRedis() {
  await redis.connect();
  await subscriber.connect();
  await connectPostgres();
  await copyRedisSignIns();
}

/**
 * Starts deleting expired tables and sign-ins, after the outage check is in place (see whenExpiring).
 * The first pass also deletes every record from before RECORD_VERSION, through the same path as an expired table.
 */
export async function startExpiry() {
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

const CURRENT = `record->>'v' = '${RECORD_VERSION}'`;


export async function readTable(id: string) {
  const found = await pool.query<{ record: TableRecord }>(
    `SELECT record FROM tables WHERE id = $1 AND expires_at > now() AND ${CURRENT}`,
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
     WHERE id = $1 AND expires_at > now() AND ${CURRENT} AND COALESCE((record->>'revision')::int, 0) = $4`,
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
    `SELECT count(*)::text AS count FROM tables WHERE expires_at > now() AND ${CURRENT} AND record->>'hostEmail' = $1`,
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
export async function insertHostTable(table: TableRecord) {
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
         WHERE tables.expires_at <= now() OR tables.record->>'v' IS DISTINCT FROM EXCLUDED.record->>'v'
       RETURNING id`,
      [table.id, table.game.kind, JSON.stringify(table), TABLE_TTL_MS / 1000],
    );
    return saved.rowCount === 1;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`open-tables:${email}`]).catch(() => undefined);
    client.release();
  }
}

export async function insertTable(table: TableRecord) {
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
       WHERE tables.expires_at <= now() OR tables.record->>'v' IS DISTINCT FROM EXCLUDED.record->>'v'
     RETURNING id`,
    [table.id, table.game.kind, JSON.stringify(table), TABLE_TTL_MS / 1000],
  );
  return saved.rowCount === 1;
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
      await redis.del(ids.map((id) => `ledger:${id}`));
    }
  }
  await deleteHostSessions(email, token);
  if (ids.length > 0) await onExpired(ids);
}

export async function listOpenTables() {
  const found = await pool.query<{ id: string; record: TableRecord }>(
    `SELECT id, record FROM tables WHERE expires_at > now() AND ${CURRENT}`,
  );
  return found.rows;
}

/**
 * A paused table is meant to stay, and so is a debug table nobody has touched for a while.
 * Refresh them only as their existing lifetime runs down.
 */
export async function extendKeptTables(keep: string[]) {
  await pool.query(
    `UPDATE tables
     SET expires_at = now() + make_interval(secs => $1::int)
     WHERE expires_at > now()
       AND expires_at < now() + interval '10 minutes'
       AND ${CURRENT}
       AND ((record->>'paused' = 'true' AND COALESCE(record->>'closing', '') <> 'true') OR id = ANY($2::text[]))`,
    [TABLE_TTL_MS / 1000, keep],
  );
}

export async function removeTable(id: string) {
  await pool.query("DELETE FROM tables WHERE id = $1", [id]);
  await redis.del(`ledger:${id}`);
}

let onExpired: (ids: string[]) => Promise<void> = async () => {};

/**
 * Runs before every expiry pass. Returns null to skip the pass, or the games whose tables must be kept.
 * The outage check sits here, so time the server or an engine was down is given back to tables
 * before any of them is deleted for being quiet.
 */
let beforeExpiry: () => Promise<string[] | null> = async () => [];

export function whenExpiring(handler: () => Promise<string[] | null>) {
  beforeExpiry = handler;
}

export function whenTablesExpire(handler: (ids: string[]) => Promise<void>) {
  onExpired = handler;
}

export async function expireTables() {
  const keep = await beforeExpiry();
  if (!keep) return;
  await purgeExpiredSessions();
  const expired = await pool.query<{ id: string }>(
    `DELETE FROM tables
     WHERE (expires_at < now() AND kind <> ALL($1::text[])) OR record->>'v' IS DISTINCT FROM '${RECORD_VERSION}'
     RETURNING id`,
    [keep],
  );
  if (expired.rows.length === 0) return;
  await onExpired(expired.rows.map((row) => row.id));
}

/** Returned from withTable's callback when the record must not be written. */
export const TABLE_UNCHANGED = Symbol("table-unchanged");

const releaseLock = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`;

/** The table lock stayed taken, or saves kept conflicting. Try again shortly. */
export class TableBusy extends Error {
  constructor() {
    super("Table is busy");
  }
}

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
        if (conflicts >= CONFLICT_TRIES) throw new TableBusy();
        continue;
      } finally {
        await redis.eval(releaseLock, { keys: [lock], arguments: [token] });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new TableBusy();
}

export async function publishTable(id: string) {
  await redis.publish("tables", id);
}
