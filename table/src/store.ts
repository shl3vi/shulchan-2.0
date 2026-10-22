import { createClient, type RedisClientType } from "redis";

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
  joinAttempts?: number;
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
}

export function tableKey(id: string) {
  return `table:${id}`;
}

export async function readTable(id: string) {
  const raw = await redis.get(tableKey(id));
  return raw ? (JSON.parse(raw) as TableRecord) : null;
}

export async function writeTable(table: TableRecord) {
  await redis.set(tableKey(table.id), JSON.stringify(table));
}

export async function insertTable(table: TableRecord) {
  return (await redis.set(tableKey(table.id), JSON.stringify(table), { NX: true })) === "OK";
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
