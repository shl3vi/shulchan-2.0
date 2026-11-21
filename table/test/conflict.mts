// Needs the local Postgres and Redis (`docker compose up -d redis postgres`).
// Run from table/: npx tsx test/conflict.mts
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { connectPostgres, pool } from "../src/db.ts";
import {
  insertTable,
  readTable,
  redis,
  removeTable,
  TableConflict,
  TableNotFound,
  withTable,
  writeTable,
  type TableRecord,
} from "../src/store.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** These tests only need two numbers that both sides of a race can change. They live in the game state. */
type Numbers = { kind: "poker"; smallBlind: number; buyIn: number };

function g(table: TableRecord) {
  return table.game as Numbers;
}

function freshTable(): TableRecord {
  return {
    v: 2,
    id: `TEST-${crypto.randomUUID().slice(0, 8)}`,
    password: "123456",
    players: [],
    game: { kind: "poker", smallBlind: 1, buyIn: 100 } as Numbers,
  };
}

const made: string[] = [];
async function openTable() {
  const table = freshTable();
  assert.equal(await insertTable(table), true);
  made.push(table.id);
  return table.id;
}

before(async () => {
  await redis.connect();
  await connectPostgres();
});

after(async () => {
  for (const id of made) await removeTable(id).catch(() => undefined);
  await redis.quit();
  await pool.end();
});

test("a save from an old copy is refused and does not overwrite the newer one", async () => {
  const id = await openTable();
  const stale = (await readTable(id))!;
  const readAt = stale.revision;
  const fresh = (await readTable(id))!;
  g(fresh).buyIn = 200;
  await writeTable(fresh);

  g(stale).smallBlind = 5;
  await assert.rejects(writeTable(stale), TableConflict);
  assert.equal(stale.revision, readAt, "a refused save leaves the copy at the revision it was read at");

  const saved = (await readTable(id))!;
  assert.equal(g(saved).buyIn, 200);
  assert.equal(g(saved).smallBlind, 1);
  assert.equal(saved.revision, fresh.revision);
});

test("saving a table that is gone still says the table is gone", async () => {
  const id = await openTable();
  const copy = (await readTable(id))!;
  await removeTable(id);
  await assert.rejects(writeTable(copy), TableNotFound);
});

test("a record saved before revisions existed can still be saved", async () => {
  const id = await openTable();
  const legacy = (await readTable(id))!;
  delete legacy.revision;
  await pool.query("UPDATE tables SET record = $2::jsonb WHERE id = $1", [id, JSON.stringify(legacy)]);

  const copy = (await readTable(id))!;
  assert.equal(copy.revision, undefined);
  g(copy).buyIn = 300;
  await writeTable(copy);
  assert.equal((await readTable(id))!.revision, 1);
});

test("when a slow change outlives the lock, both changes survive", async () => {
  const id = await openTable();
  let slowRuns = 0;

  // The slow change holds the lock past its 5 second expiry, like a stalled engine call.
  const slow = withTable(id, async (table) => {
    slowRuns += 1;
    if (slowRuns === 1) await sleep(5600);
    g(table).buyIn = 400;
    return "slow";
  });

  // Once the lock has expired a second change gets in and saves first.
  await sleep(5200);
  await withTable(id, async (table) => {
    g(table).smallBlind = 7;
  });

  assert.equal(await slow, "slow");
  // At least twice: refused once, then run again on the newer table. A dev server sharing
  // this database (its idle sweep visits every open table) can add a save of its own.
  assert.ok(slowRuns >= 2, `the slow change ran ${slowRuns} times`);

  const saved = (await readTable(id))!;
  assert.equal(g(saved).smallBlind, 7, "the change that saved first is kept");
  assert.equal(g(saved).buyIn, 400, "the slow change is applied on top of it");
  assert.ok((saved.revision ?? 0) >= 3, `revision ${saved.revision}`);
});

test("Postgres cancels a query that would outlive the table lock", async () => {
  const started = Date.now();
  await assert.rejects(pool.query("SELECT pg_sleep(10)"), /statement timeout/);
  const waited = Date.now() - started;
  assert.ok(waited < 4500, `cancelled after ${waited} ms`);
  // The connection goes back to the pool in working order.
  assert.equal((await pool.query("SELECT 1 AS one")).rows[0].one, 1);
});

test("a change that keeps losing gives up as a busy table", async () => {
  const id = await openTable();
  await assert.rejects(
    withTable(id, async (table) => {
      // Someone else saves after every read, so this copy is always out of date.
      const other = (await readTable(id))!;
      g(other).buyIn += 1;
      await writeTable(other);
      g(table).smallBlind = 9;
    }),
    /Table is busy/,
  );
  const saved = (await readTable(id))!;
  assert.equal(g(saved).smallBlind, 1, "the losing change never landed");
  assert.equal(g(saved).buyIn, 103, "every competing save was kept");
});
