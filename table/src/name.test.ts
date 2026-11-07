import assert from "node:assert/strict";
import test from "node:test";
import { nameProblem } from "./name.js";
import { chooseSeat } from "./seats.js";

test("a normal name is kept and a slur is refused", () => {
  assert.equal(nameProblem("Shahar"), null);
  assert.equal(nameProblem("שחר"), null);
  assert.equal(nameProblem("Janus"), null);
  assert.equal(nameProblem("Dick"), "blocked");
  assert.equal(nameProblem("f.u.c.k"), "blocked");
  assert.equal(nameProblem("fuuuck"), "blocked");
  assert.equal(nameProblem("שרמוטה"), "blocked");
  assert.equal(nameProblem("ass"), "blocked");
  assert.equal(nameProblem(""), "length");
  assert.equal(nameProblem("a".repeat(25)), "length");
});

test("a blocked neighbor is seated across the table when a chair is free", () => {
  assert.equal(chooseSeat([], [], "poker"), 0);
  assert.equal(chooseSeat([], [0], "poker"), 4);
  assert.equal(chooseSeat([4], [0], "poker"), 5);
});

test("backgammon leaves a blocked pair as spectators once two people are already playing", () => {
  assert.equal(chooseSeat([0], [0], "backgammon"), 1);
  assert.equal(chooseSeat([0, 1], [0], "backgammon"), 8);
});
