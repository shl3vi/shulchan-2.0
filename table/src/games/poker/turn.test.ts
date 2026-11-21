import assert from "node:assert/strict";
import test from "node:test";
import type { EngineView } from "./engine.js";
import { restartTurn, stampTurn, timeoutAction, TURN_MS, turnExpired, type TurnClock } from "./turn.js";

function view(seat: number | null, round: EngineView["round"] = "preflop", legal: EngineView["legalActions"] = ["fold", "call"]): EngineView {
  return {
    communityCards: [],
    pots: [],
    round,
    playerToActSeat: seat,
    seats: [],
    holeCards: [],
    legalActions: legal,
    chipRange: null,
    lastWinners: [],
    shownCards: [],
  };
}

test("a new seat to act gets a full clock, a seat change between actions does not reset it", () => {
  const table: { turn?: TurnClock } = {};
  stampTurn(table, view(2), 1000, true);
  assert.deepEqual(table.turn, { seat: 2, round: "preflop", deadline: 1000 + TURN_MS });
  // Someone joins or rebuys while seat 2 is thinking: the clock keeps running.
  stampTurn(table, view(2), 9000, false);
  assert.equal(table.turn?.deadline, 1000 + TURN_MS);
  // Seat 2 acts and seat 3 is next.
  stampTurn(table, view(3), 12000, true);
  assert.equal(table.turn?.seat, 3);
  assert.equal(table.turn?.deadline, 12000 + TURN_MS);
});

test("the same seat on a new street gets a new clock even without a fresh action", () => {
  const table: { turn?: TurnClock } = {};
  stampTurn(table, view(1, "preflop"), 0, true);
  stampTurn(table, view(1, "flop"), 5000, false);
  assert.equal(table.turn?.deadline, 5000 + TURN_MS);
});

test("no hand, no clock", () => {
  const table: { turn?: TurnClock } = {};
  stampTurn(table, view(1), 0, true);
  stampTurn(table, view(null, null), 10, true);
  assert.equal(table.turn, undefined);
});

test("the clock runs out only for the seat it was started for", () => {
  const table: { turn?: TurnClock } = {};
  stampTurn(table, view(4), 0, true);
  assert.equal(turnExpired(table, view(4), TURN_MS - 1), false);
  assert.equal(turnExpired(table, view(4), TURN_MS), true);
  assert.equal(turnExpired(table, view(5), TURN_MS), false);
  assert.equal(turnExpired(table, view(4, "flop"), TURN_MS), false);
});

test("resuming from a pause gives a full clock", () => {
  const table: { turn?: TurnClock } = {};
  stampTurn(table, view(4), 0, true);
  restartTurn(table, 50_000);
  assert.equal(table.turn?.deadline, 50_000 + TURN_MS);
});

test("timing out checks when free and folds when facing a bet", () => {
  assert.equal(timeoutAction(["fold", "check", "bet"]), "check");
  assert.equal(timeoutAction(["fold", "call", "raise"]), "fold");
  assert.equal(timeoutAction([]), null);
});
