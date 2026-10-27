import { createAdapter } from "@socket.io/redis-adapter";
import type { RedisClientType } from "redis";
import type { Server } from "socket.io";
import { redis } from "./store.js";

function watch(client: RedisClientType, label: string) {
  client.on("error", (error: Error) => {
    console.error(label, error.message);
  });
}

/**
 * One table process only sees the phones connected to it. The adapter publishes
 * room events through Redis, so a second process delivers them to its own phones.
 */
export async function attachCluster(io: Server) {
  const pub = redis.duplicate();
  const sub = redis.duplicate();
  watch(pub, "Socket adapter publish failed");
  watch(sub, "Socket adapter subscribe failed");
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  return async function closeCluster() {
    await pub.quit().catch(() => undefined);
    await sub.quit().catch(() => undefined);
  };
}
