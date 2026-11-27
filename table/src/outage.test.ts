import assert from "node:assert/strict";
import test from "node:test";
import { shiftTable } from "./outage.js";
import { RECORD_VERSION, type TableRecord } from "./store.js";

const MIN = 60 * 1000;

function table(extra: Partial<TableRecord> = {}, game: object = { kind: "dice" }): TableRecord {
  return { v: RECORD_VERSION, id: "t", password: "123456", players: [], game: game as TableRecord["game"], ...extra };
}

test("an outage is given back to the idle fuse, the pause hour and the admin's time away", () => {
  const now = 100 * MIN;
  const record = table({ lastActivityAt: 80 * MIN, pausedAt: 70 * MIN, adminAwaySince: 81 * MIN, idleCloseAt: 90 * MIN });
  shiftTable(record, 17 * MIN, now);
  assert.equal(record.lastActivityAt, 97 * MIN);
  assert.equal(record.pausedAt, 87 * MIN);
  assert.equal(record.adminAwaySince, 98 * MIN);
  // The sweep works the warning out again from the moved last move.
  assert.equal(record.idleCloseAt, undefined);
});

test("a moved time never lands in the future", () => {
  const now = 100 * MIN;
  const record = table({ lastActivityAt: 95 * MIN });
  shiftTable(record, 20 * MIN, now);
  assert.equal(record.lastActivityAt, now);
});

test("a closing table is left alone", () => {
  const record = table({ lastActivityAt: 10 * MIN, closing: true });
  shiftTable(record, 5 * MIN, 100 * MIN);
  assert.equal(record.lastActivityAt, 10 * MIN);
});

test("poker's turn clock and next deal wait as long as the outage", () => {
  const record = table({ lastActivityAt: 0 }, { kind: "poker", turn: { seat: 1, round: "flop", deadline: 50 * MIN }, autoDealAt: 52 * MIN });
  shiftTable(record, 10 * MIN, 100 * MIN);
  const game = record.game as unknown as { turn: { deadline: number }; autoDealAt: number };
  assert.equal(game.turn.deadline, 60 * MIN);
  assert.equal(game.autoDealAt, 62 * MIN);
});
