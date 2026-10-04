import { createClient, type RedisClientType } from "redis";

export type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
  seat: number;
  pendingRemoval?: boolean;
};

export type TableRecord = {
  id: string;
  adminId?: string;
  adminSecret: string;
  smallBlind: number;
  buyIn: number;
  password: string;
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

export async function publishTable(id: string) {
  await redis.publish("tables", id);
}
