import { createClient, type RedisClientType } from "redis";
import type { EngineView } from "./engine.js";
import { connectPostgres, pool, TABLE_TTL_MS } from "./db.js";

export type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
  /** Stable across tables, so a block still applies the next time these two sit together. */
  personKey?: string;
  seat: number;
  bought: number;
  pendingRemoval?: boolean;
};

export type TableRecord = {
  id: string;
  adminId?: string;
  adminSecret?: string;
  smallBlind: number;
  buyIn: number;
  password: string;
  hostEmail?: string;
  /** Poker only. The next hand starts on its own once the table is waiting. */
  autoDeal?: boolean;
  kind?: "poker" | "backgammon";
  backgammon?: unknown;
  backgammonLog?: { whiteName: string; blackName: string; winner: "white" | "black"; points: number }[];
  poker?: unknown;
  pokerView?: EngineView;
  /** Bumped on every saved change, so a restart cannot revive an older hand. */
  revision?: number;
  players: SeatPlayer[];
};

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

export async function writeTable(table: TableRecord) {
  table.revision = (table.revision ?? 0) + 1;
  const saved = await pool.query(
    `UPDATE tables
     SET record = $2::jsonb, updated_at = now(), expires_at = now() + make_interval(secs => $3::int)
     WHERE id = $1 AND expires_at > now()`,
    [table.id, JSON.stringify(table), TABLE_TTL_MS / 1000],
  );
  if (saved.rowCount !== 1) throw new TableNotFound();
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
         WHERE tables.expires_at <= now()
       RETURNING id`,
      [table.id, table.kind ?? "poker", JSON.stringify(table), TABLE_TTL_MS / 1000],
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
       WHERE tables.expires_at <= now()
     RETURNING id`,
    [table.id, table.kind ?? "poker", JSON.stringify(table), TABLE_TTL_MS / 1000],
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

const releaseLock = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`;

export class TableNotFound extends Error {
  constructor() {
    super("Game not found");
  }
}

// Every change to a table record goes through here, so concurrent joins, leaves, and admin moves cannot overwrite each other.
export async function withTable<T>(id: string, run: (table: TableRecord) => Promise<T>): Promise<T> {
  const lock = `lock:table:${id}`;
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await redis.set(lock, token, { NX: true, PX: 5000 })) {
      try {
        const table = await readTable(id);
        if (!table) throw new TableNotFound();
        const result = await run(table);
        await writeTable(table);
        return result;
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
