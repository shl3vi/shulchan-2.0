import { pool } from "../db.js";
import { redis } from "../store.js";
import { publish } from "./bus.js";

const EVERY_MS = 5 * 60 * 1000;
let timer: NodeJS.Timeout | undefined;

async function beat() {
  let redisOk = false;
  let postgresOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }
  try {
    await pool.query("SELECT 1");
    postgresOk = true;
  } catch {
    postgresOk = false;
  }
  publish({ name: "server.heartbeat", data: { redisOk, postgresOk } });
}

export function startHeartbeat() {
  void beat();
  timer = setInterval(() => {
    void beat();
  }, EVERY_MS);
  timer.unref();
}

export function stopHeartbeat() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
