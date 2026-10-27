import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const token = "handtoken";
const port = 4101;
const childEnv = { ...process.env, ENGINE_TOKEN: token, PORT: String(port) };
delete childEnv.REDIS_URL;
delete childEnv.DATABASE_URL;
const child = spawn("node", ["dist/index.js"], {
  cwd: fileURLToPath(new URL("../../poker-engine/", import.meta.url)),
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
const ready = once(child.stdout, "data");
const died = once(child, "exit");
await Promise.race([ready, died]);
if (child.exitCode != null) throw new Error(log || "Poker engine exited");

async function call(path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-engine-token": token },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { hand?: { seats: Array<number | null>; hand: unknown }; view?: { round: string | null; seats: { seat: number }[] }; error?: string };
  if (!response.ok) throw new Error(payload.error ?? response.statusText);
  return payload;
}

const health = await fetch(`http://127.0.0.1:${port}/health`);
assert.equal(health.status, 200);
const opened = await call("/games", { smallBlind: 1 });
const seated = await call("/apply", { hand: opened.hand, action: { type: "seat", seat: 0, stack: 100 } });
const both = await call("/apply", { hand: seated.hand, action: { type: "seat", seat: 1, stack: 100 } });
const started = await call("/apply", { hand: both.hand, action: { type: "start" } });
assert.equal(started.view?.round, "preflop");
const ignored = await call("/apply", { hand: opened.hand, action: { type: "present" } });
assert.equal(ignored.view?.seats.length, 0);
assert.equal(started.view?.seats.length, 2);
process.env.ENGINE_TOKEN = token;
process.env.POKER_ENGINE_URL = `http://127.0.0.1:${port}`;
const { connectRedis, insertTable, readTable, redis, removeTable, stopStore, subscriber, withTable } = await import("../src/store.ts");
const { createPokerTable, readPoker, seatPoker } = await import("../src/engine.ts");
const { pool } = await import("../src/db.ts");
await connectRedis();
const id = "ZZHAND";
await removeTable(id);
const table = { id, smallBlind: 1, buyIn: 100, password: "123456", players: [] };
const view = await createPokerTable(table, 1);
assert.equal(await insertTable(table), true);
const saved = await readTable(id);
assert.ok(saved?.poker);
assert.equal(await redis.get(`poker:${id}`), null);
assert.equal((await readPoker(saved!)).seats.length, view.seats.length);
await withTable(id, async (current) => {
  await seatPoker(current, 0, 100);
});
const after = await readTable(id);
assert.equal((after?.poker as { seats: Array<number | null> }).seats[0], 100);
await removeTable(id);
stopStore();
await redis.quit();
await subscriber.quit();
await pool.end();
child.kill("SIGTERM");
await once(child, "exit");
console.log("The table stored the hand, and the engine kept none");
