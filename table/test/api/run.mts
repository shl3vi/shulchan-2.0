/**
 * Starts the real stack (the four game engines and the table service) against a throwaway Postgres database and
 * Redis database, runs the API tests in this folder against it, and stops everything.
 *
 *   npm run test:api            (from table/)
 *
 * Needs Postgres and Redis. Locally: `docker compose up -d redis postgres` from the repo root. In CI they are service
 * containers. The tests never touch the dev data: they use the `shulchan_test` database and Redis database 15,
 * and both are wiped at the start of a run.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "redis";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));

const baseDatabaseUrl = process.env.DATABASE_URL ?? "postgres://shulchan:shulchan@127.0.0.1:5432/shulchan";
const testDatabase = "shulchan_test";
const databaseUrl = (() => {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${testDatabase}`;
  return url.toString();
})();
const redisUrl = (() => {
  const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  url.pathname = "/15";
  return url.toString();
})();

const basePort = Number(process.env.API_TEST_PORT ?? 4810);
const ports = { table: basePort, poker: basePort + 1, backgammon: basePort + 2, dice: basePort + 3, tiles: basePort + 4 };
const engineToken = "api-test-engine-token";

async function freshDatabase() {
  const admin = new pg.Client({ connectionString: baseDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${testDatabase}`);
  } finally {
    await admin.end();
  }
}

async function freshRedis() {
  const client = createClient({ url: redisUrl });
  await client.connect();
  await client.flushDb();
  await client.quit();
}

const children: ChildProcess[] = [];
const logs = new Map<string, string>();

function start(name: string, dir: string, env: Record<string, string>) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: `${root}${dir}`,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  logs.set(name, "");
  const keep = (chunk: Buffer) => logs.set(name, (logs.get(name) ?? "") + chunk.toString());
  child.stdout!.on("data", keep);
  child.stderr!.on("data", keep);
  children.push(child);
  return child;
}

async function waitForHealth(name: string, port: number, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${name} did not become healthy on port ${port}\n${logs.get(name) ?? ""}`);
}

function stopAll() {
  for (const child of children) if (child.exitCode == null) child.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

let code = 1;
try {
  await freshDatabase();
  await freshRedis();

  const engines = [
    ["poker", "poker-engine", ports.poker],
    ["backgammon", "backgammon-engine", ports.backgammon],
    ["dice", "dice-engine", ports.dice],
    ["tiles", "tiles-engine", ports.tiles],
  ] as const;
  for (const [name, dir, port] of engines) {
    const child = start(name, dir, { PORT: String(port), ENGINE_TOKEN: engineToken });
    await waitForHealth(name, port, child);
  }

  const table = start("table", "table", {
    NODE_ENV: "test",
    PORT: String(ports.table),
    ENGINE_TOKEN: engineToken,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    POKER_ENGINE_URL: `http://127.0.0.1:${ports.poker}`,
    BACKGAMMON_ENGINE_URL: `http://127.0.0.1:${ports.backgammon}`,
    DICE_ENGINE_URL: `http://127.0.0.1:${ports.dice}`,
    TILES_ENGINE_URL: `http://127.0.0.1:${ports.tiles}`,
    // Every test request comes from 127.0.0.1. The helpers give each request its own X-Forwarded-For address,
    // so the per-address limits only trip in the tests that aim at them.
    RATE_LIMIT: "30",
    SIGN_IN_LIMIT: "3",
    SOCKET_EVENT_LIMIT: "40",
    GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_OAUTH_SECRET: "test-secret",
    GOOGLE_OAUTH_REDIRECT_URI: `http://127.0.0.1:${ports.table}/auth/callback`,
    // No analytics, no video, no debug table, no upstream sign-in.
    POSTHOG_API_KEY: "",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
    DEBUG_TABLE_ID: "",
    DEBUG_DASHBOARD_ID: "",
    AUTH_UPSTREAM: "",
  });
  await waitForHealth("table", ports.table, table);

  const files = readdirSync(here).filter((file) => file.endsWith(".test.mts")).sort().map((file) => `${here}${file}`);
  const only = process.argv.slice(2);
  const runner = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...(only.length ? only : files)], {
    cwd: `${root}table`,
    env: { ...process.env, API_URL: `http://127.0.0.1:${ports.table}`, API_REDIS_URL: redisUrl, API_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  code = await new Promise<number>((resolve) => runner.on("exit", (exit) => resolve(exit ?? 1)));
  if (code !== 0) console.error(`\n--- table service log ---\n${logs.get("table") ?? ""}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  code = 1;
} finally {
  stopAll();
}
process.exit(code);
