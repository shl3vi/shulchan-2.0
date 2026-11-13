import assert from "node:assert/strict";
import test from "node:test";
import { IDLE_CLOSE_MS, IDLE_WARN_MS, needsIdleWrite, noteActivity, setPaused, sweepIdle, type IdleTable } from "./idle.js";

const MIN = 60 * 1000;

test("the warning and the close are anchored to the last real action", () => {
  const opened = 1_000_000;
  const table: IdleTable = { lastActivityAt: opened };
  assert.equal(sweepIdle(table, opened + IDLE_WARN_MS - 1), "hold");
  assert.equal(table.idleCloseAt, undefined);

  assert.equal(sweepIdle(table, opened + IDLE_WARN_MS), "warn");
  assert.equal(table.idleCloseAt, opened + IDLE_CLOSE_MS);

  // Noticing the warning late does not move the deadline.
  assert.equal(sweepIdle(table, opened + IDLE_WARN_MS + 4 * MIN), "hold");
  assert.equal(table.idleCloseAt, opened + IDLE_CLOSE_MS);

  assert.equal(sweepIdle(table, opened + IDLE_CLOSE_MS), "close");
  assert.equal(table.closing, true);
  assert.equal(needsIdleWrite(table, opened + IDLE_CLOSE_MS), true);
});

test("a real action clears the warning and restarts the fuse", () => {
  const opened = 1_000_000;
  const table: IdleTable = { lastActivityAt: opened };
  sweepIdle(table, opened + 6 * MIN);
  noteActivity(table, opened + 6 * MIN);
  assert.equal(table.idleCloseAt, undefined);
  assert.equal(table.lastActivityAt, opened + 6 * MIN);
  assert.equal(sweepIdle(table, opened + 6 * MIN + IDLE_WARN_MS - 1), "hold");
  assert.equal(needsIdleWrite(table, opened + 6 * MIN), false);
});

test("active pause freezes the fuse and resuming does not grant a new one", () => {
  const opened = 5_000_000;
  const table: IdleTable = { lastActivityAt: opened };
  const at = opened + 6 * MIN;
  setPaused(table, true, at);
  assert.equal(table.paused, true);
  assert.equal(table.idleCarry, 6 * MIN);
  assert.equal(table.idleCloseAt, undefined);
  assert.equal(sweepIdle(table, at + 60 * MIN), "hold");
  assert.equal(table.closing, undefined);

  // Pausing again must not measure the fuse from the pause itself.
  setPaused(table, true, at + 30 * MIN);
  assert.equal(table.idleCarry, 6 * MIN);

  const back = at + 60 * MIN;
  setPaused(table, false, back);
  assert.equal(table.paused, undefined);
  assert.equal(table.lastActivityAt, back - 6 * MIN);
  assert.equal(table.idleCloseAt, table.lastActivityAt! + IDLE_CLOSE_MS);
  assert.equal(table.idleCloseAt! - back, 4 * MIN);
});

test("pausing at the start keeps the original window, not extra time", () => {
  const opened = 9_000;
  const table: IdleTable = { lastActivityAt: opened };
  setPaused(table, true, opened);
  assert.equal(table.idleCarry, 0);
  const back = opened + 60 * MIN;
  setPaused(table, false, back);
  assert.equal(table.lastActivityAt, back);
  assert.equal(table.idleCloseAt, undefined);
  assert.equal(sweepIdle(table, back + IDLE_CLOSE_MS), "close");
});

test("a fuse that has already burned out cannot be paused", () => {
  const opened = 2_000;
  const table: IdleTable = { lastActivityAt: opened };
  assert.throws(() => setPaused(table, true, opened + IDLE_CLOSE_MS), /Table is closing/);
  assert.equal(table.paused, undefined);
  sweepIdle(table, opened + IDLE_CLOSE_MS);
  assert.throws(() => setPaused(table, false, opened + IDLE_CLOSE_MS + 1), /Table is closing/);
});

test("a table with no timestamp is seeded instead of closed", () => {
  const now = 50_000;
  const table: IdleTable = {};
  assert.equal(needsIdleWrite(table, now), true);
  assert.equal(sweepIdle(table, now), "seed");
  assert.equal(table.lastActivityAt, now);
  assert.equal(sweepIdle(table, now + IDLE_WARN_MS - 1), "hold");
});

test("a future timestamp cannot postpone the fuse", () => {
  const now = 80_000;
  const table: IdleTable = { lastActivityAt: now + 60 * MIN, idleCloseAt: now + 24 * 60 * MIN };
  assert.equal(sweepIdle(table, now), "seed");
  assert.equal(table.lastActivityAt, now);
  assert.equal(table.idleCloseAt, undefined);
});

test("a stored deadline cannot outlive the last action", () => {
  const opened = 10_000;
  const table: IdleTable = { lastActivityAt: opened, idleCloseAt: opened + 24 * 60 * MIN };
  assert.equal(sweepIdle(table, opened + 6 * MIN), "warn");
  assert.equal(table.idleCloseAt, opened + IDLE_CLOSE_MS);
});
