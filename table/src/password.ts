import { redis } from "./store.js";

const WINDOW_SECONDS = 10 * 60;
const TABLE_LOCK_SECONDS = 120;

function limit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function backoffSeconds(over: number) {
  return Math.min(900, 30 * 2 ** Math.min(Math.max(over, 1) - 1, 5));
}

function wait(ttl: number) {
  return ttl > 0 ? ttl : 0;
}

async function bump(key: string) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  return count;
}

export async function passwordRetryAfter(tableId: string, ip: string) {
  const [pair, fromIp, table] = await Promise.all([
    redis.ttl(`pwlock:${tableId}:${ip}`),
    redis.ttl(`pwlock:ip:${ip}`),
    redis.ttl(`pwlock:table:${tableId}`),
  ]);
  return Math.max(wait(pair), wait(fromIp), wait(table));
}

export async function noteWrongPassword(tableId: string, ip: string) {
  const [pair, fromIp, table] = await Promise.all([
    bump(`pwfail:${tableId}:${ip}`),
    bump(`pwfail:ip:${ip}`),
    bump(`pwfail:table:${tableId}`),
  ]);
  let retry = 0;
  if (pair > limit("PASSWORD_FAILS", 5)) {
    const seconds = backoffSeconds(pair - limit("PASSWORD_FAILS", 5));
    await redis.set(`pwlock:${tableId}:${ip}`, "1", { EX: seconds });
    retry = Math.max(retry, seconds);
  }
  if (fromIp > limit("PASSWORD_FAILS_IP", 12)) {
    const seconds = backoffSeconds(fromIp - limit("PASSWORD_FAILS_IP", 12));
    await redis.set(`pwlock:ip:${ip}`, "1", { EX: seconds });
    retry = Math.max(retry, seconds);
  }
  if (table > limit("PASSWORD_FAILS_TABLE", 20)) {
    await redis.del(`pwfail:table:${tableId}`);
    await redis.set(`pwlock:table:${tableId}`, "1", { EX: TABLE_LOCK_SECONDS });
    retry = Math.max(retry, TABLE_LOCK_SECONDS);
  }
  return retry;
}

export async function clearPasswordFailures(tableId: string, ip: string) {
  await redis.del([`pwfail:${tableId}:${ip}`, `pwlock:${tableId}:${ip}`]);
}
