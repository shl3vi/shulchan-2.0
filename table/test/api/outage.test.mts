import assert from "node:assert/strict";
import test from "node:test";
import { db, openTable } from "./helpers.mts";

const MIN = 60 * 1000;

async function record(gameId: string) {
  const found = await db.query<{ record: any; live: boolean }>("SELECT record, expires_at > now() AS live FROM tables WHERE id = $1", [gameId]);
  return found.rows[0] ?? null;
}

/** Waits for the next sweep (every 10 seconds) to have given the time back. */
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 30; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail("the sweep did not give the time back");
}

test("time the server was down is given back, even to a table whose expiry passed meanwhile", async () => {
  const table = await openTable();
  const quietSince = Date.now() - 15 * MIN;
  // As if the last move was 15 minutes ago and the table service then stopped for 20 minutes.
  await db.query(
    `UPDATE tables SET record = jsonb_set(record, '{lastActivityAt}', to_jsonb($2::bigint)), expires_at = now() - interval '1 minute' WHERE id = $1`,
    [table.gameId, quietSince],
  );
  await db.query("UPDATE alive SET at = $1 WHERE name = 'server'", [Date.now() - 20 * MIN]);

  await until(async () => (await record(table.gameId))?.live === true);
  const after = await record(table.gameId);
  assert.ok(after, "the table is still there");
  assert.equal(after.record.closing, undefined);
  // Fifteen quiet minutes, less the twenty nobody could play, is no idle time at all.
  assert.ok(after.record.lastActivityAt >= Date.now() - MIN);
});

test("time one game's engine was down is given back to that game's tables only", async () => {
  const dice = await openTable({ kind: "dice" });
  const poker = await openTable();
  const quietSince = Date.now() - 8 * MIN;
  for (const id of [dice.gameId, poker.gameId]) {
    await db.query("UPDATE tables SET record = jsonb_set(record, '{lastActivityAt}', to_jsonb($2::bigint)) WHERE id = $1", [id, quietSince]);
  }
  await db.query("UPDATE alive SET at = $1 WHERE name = 'engine:dice'", [Date.now() - 6 * MIN]);

  await until(async () => (await record(dice.gameId))?.record.lastActivityAt > quietSince);
  const diceAfter = await record(dice.gameId);
  const pokerAfter = await record(poker.gameId);
  assert.ok(Math.abs(diceAfter!.record.lastActivityAt - (quietSince + 6 * MIN)) < 30_000);
  assert.equal(pokerAfter!.record.lastActivityAt, quietSince);
});
