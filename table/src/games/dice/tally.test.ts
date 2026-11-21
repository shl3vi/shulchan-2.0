import assert from "node:assert/strict";
import test from "node:test";
import { freshTally } from "../../events/tally.js";
import type { DicePlay } from "./state.js";
import { applyDice } from "./tally.js";

function play(scored: number[]): DicePlay {
  const boxes = ["ones", "twos", "threes"];
  return {
    phase: "playing",
    turn: 0,
    rolls: 0,
    winners: [],
    players: scored.map((count, index) => ({
      id: `p${index}`,
      name: `P${index}`,
      scores: Object.fromEntries(boxes.slice(0, count).map((box) => [box, 1])),
    })),
  } as DicePlay;
}

test("a dice game is a game started, and a round is a box scored", () => {
  const tally = freshTally("dice", 0);
  applyDice(tally, null, play([0, 0]), true);
  applyDice(tally, play([0, 0]), play([0, 0]), false);
  applyDice(tally, play([0, 0]), play([1, 0]), false);
  applyDice(tally, play([1, 0]), play([1, 1]), false);
  assert.equal(tally.games, 1);
  assert.equal(tally.rounds, 2);
});
