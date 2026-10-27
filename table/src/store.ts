import { createClient, type RedisClientType } from "redis";
import { connectPostgres, pool, secondsUntil, TABLE_TTL_MS } from "./db.js";

export type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
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
  kind?: "poker" | "backgammon";
  backgammon?: unknown;
  backgammonLog?: { whiteName: string; blackName: string; winner: "white" | "black"; points: number }[];
  players: SeatPlayer[];
};

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis: RedisClientType = createClient({ url: redisUrl });
export const subscriber: RedisClientType = createClient({ url: redisUrl });

export async function connectRedis() {
  await redis.connect();
  await subscriber.connect();
  await connectPostgres();
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

export async function readTable(id: string) {
  const raw = await redis.get(tableKey(id));
  if (raw) return JSON.parse(raw) as TableRecord;
  const found = await pool.query<{ record: TableRecord; expires_at: Date }>(
    "SELECT record, expires_at FROM tables WHERE id = $1 AND expires_at > now()",
    [id],
  );
  const row = found.rows[0];
  if (!row) return null;
  await redis.set(tableKey(id), JSON.stringify(row.record), { EX: secondsUntil(row.expires_at) });
  return row.record;
}

const pendingTables = new Map<string, TableRecord>();
let persistChain: Promise<void> = Promise.resolve();

function queueTable(table: TableRecord) {
  pendingTables.set(table.id, table);
  persistChain = persistChain.then(writePendingTables).catch((error) => {
    console.error("Table persist failed", error instanceof Error ? error.message : error);
  });
}

async function writePendingTables() {
  while (pendingTables.size > 0) {
    const batch = [...pendingTables.values()];
    pendingTables.clear();
    for (const table of batch) {
      const latest = pendingTables.get(table.id) ?? table;
      pendingTables.delete(table.id);
      try {
        const saved = await pool.query(
          "UPDATE tables SET record = $2::jsonb, updated_at = now() WHERE id = $1 AND expires_at > now()",
          [latest.id, JSON.stringify(latest)],
        );
        if (saved.rowCount !== 1) console.error("Table persist skipped", latest.id);
      } catch (error) {
        if (!pendingTables.has(latest.id)) pendingTables.set(latest.id, latest);
        throw error;
      }
    }
  }
}

/** Waits until the latest table records have been written to Postgres. */
export async function flushTables() {
  await persistChain;
  if (pendingTables.size === 0) return;
  queueTable([...pendingTables.values()][0]!);
  await persistChain;
}

/** Redis is the live copy. Postgres follows in the background, so a move is not waiting on it. */
export async function writeTable(table: TableRecord) {
  const key = tableKey(table.id);
  const ttl = await redis.ttl(key);
  if (ttl > 0) {
    await redis.set(key, JSON.stringify(table), { EX: ttl });
    queueTable(table);
    return;
  }
  const saved = await pool.query<{ expires_at: Date }>(
    "UPDATE tables SET record = $2::jsonb, updated_at = now() WHERE id = $1 AND expires_at > now() RETURNING expires_at",
    [table.id, JSON.stringify(table)],
  );
  const row = saved.rows[0];
  if (!row) throw new TableNotFound();
  await redis.set(key, JSON.stringify(table), { EX: secondsUntil(row.expires_at) });
}

export async function insertTable(table: TableRecord) {
  const expiresAt = new Date(Date.now() + TABLE_TTL_MS);
  const saved = await pool.query(
    `INSERT INTO tables (id, kind, record, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (id) DO UPDATE
       SET kind = EXCLUDED.kind,
           record = EXCLUDED.record,
           engine = NULL,
           created_at = now(),
           expires_at = EXCLUDED.expires_at,
           updated_at = now()
       WHERE tables.expires_at <= now()
     RETURNING id`,
    [table.id, table.kind ?? "poker", JSON.stringify(table), expiresAt],
  );
  if (saved.rowCount !== 1) return false;
  try {
    const ok = (await redis.set(tableKey(table.id), JSON.stringify(table), { NX: true, EX: secondsUntil(expiresAt) })) === "OK";
    if (!ok) {
      await pool.query("DELETE FROM tables WHERE id = $1", [table.id]);
      return false;
    }
    return true;
  } catch (error) {
    await pool.query("DELETE FROM tables WHERE id = $1", [table.id]);
    throw error;
  }
}

export async function removeTable(id: string) {
  await pool.query("DELETE FROM tables WHERE id = $1", [id]);
  await redis.del([tableKey(id), pokerKey(id), `ledger:${id}`]);
}

let onExpired: (ids: string[]) => Promise<void> = async () => {};

export function whenTablesExpire(handler: (ids: string[]) => Promise<void>) {
  onExpired = handler;
}

async function expireTables() {
  const expired = await pool.query<{ id: string }>("DELETE FROM tables WHERE expires_at < now() RETURNING id");
  if (expired.rows.length === 0) return;
  await redis.del(expired.rows.flatMap((row) => [tableKey(row.id), pokerKey(row.id)]));
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
