import assert from "node:assert/strict";
import test from "node:test";
import { applyBackgammon, applyPlayers, applyPoker, freshTally } from "./tally.js";

test("a poker hand counts once, and streets after the deal count as rounds", () => {
  const tally = freshTally("poker", 0);
  applyPoker(tally, "preflop");
  applyPoker(tally, "flop");
  applyPoker(tally, "turn");
  applyPoker(tally, null);
  applyPoker(tally, "preflop");
  assert.equal(tally.games, 2);
  assert.equal(tally.rounds, 2);
});

test("the last player leaving closes the session, an empty create does not", () => {
  const tally = freshTally("poker", 0);
  assert.equal(applyPlayers(tally, 0), false);
  assert.equal(applyPlayers(tally, 4), false);
  assert.equal(tally.peakPlayers, 4);
  assert.equal(applyPlayers(tally, 6), false);
  assert.equal(applyPlayers(tally, 2), false);
  assert.equal(tally.peakPlayers, 6);
  assert.equal(applyPlayers(tally, 0), true);
});

test("a backgammon turn is a change of color back to roll, and a win is a game", () => {
  const tally = freshTally("backgammon", 0);
  applyBackgammon(tally, { phase: "opening", turn: "white" }, { phase: "roll", turn: "white" }, 0);
  applyBackgammon(tally, { phase: "move", turn: "white" }, { phase: "roll", turn: "black" }, 0);
  applyBackgammon(tally, { phase: "move", turn: "black" }, { phase: "over", turn: "white" }, 1);
  assert.equal(tally.rounds, 1);
  assert.equal(tally.games, 1);
});
