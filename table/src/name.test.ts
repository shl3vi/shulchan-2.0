import assert from "node:assert/strict";
import test from "node:test";
import { nameProblem, setNameExtras } from "./name.js";

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

test("a remote word is refused and a built-in word stays refused", () => {
  setNameExtras(["watermelon"], ["zz"]);
  assert.equal(nameProblem("watermelon"), "blocked");
  assert.equal(nameProblem("zz"), "blocked");
  assert.equal(nameProblem("Shahar"), null);
  assert.equal(nameProblem("ass"), "blocked");
  setNameExtras([], []);
});
