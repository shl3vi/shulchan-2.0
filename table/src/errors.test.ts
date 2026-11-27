import assert from "node:assert/strict";
import test from "node:test";
import { EngineFailed, EngineRefused, EngineTimeout } from "./engines.js";
import { codeOf, messageOf, REFUSAL, TableRefused } from "./errors.js";
import { allGames } from "./games/index.js";
import { TableBusy, TableNotFound } from "./store.js";

test("every error a move can throw reaches the phone as a code", () => {
  assert.equal(codeOf(new TableRefused("invalid", "Table is paused", REFUSAL.paused)), "paused");
  assert.equal(codeOf(new EngineTimeout()), "engine-slow");
  assert.equal(codeOf(new EngineFailed("fetch failed")), "engine-down");
  assert.equal(codeOf(new TableBusy()), "busy");
  assert.equal(codeOf(new TableNotFound()), "not-found");
  assert.equal(codeOf(new Error("Table changed while saving")), "failed");
});

test("an engine's refusal is coded by its game, and one the game does not list is 'failed'", () => {
  const poker = Object.fromEntries(allGames())["poker"]!;
  assert.equal(codeOf(new EngineRefused("Not your turn"), poker.engineCode), "not-your-turn");
  assert.equal(codeOf(new EngineRefused("Bet size is outside the allowed range"), poker.engineCode), "poker.bet-range");
  assert.equal(codeOf(new EngineRefused("Seat is taken"), poker.engineCode), "failed");
  assert.equal(codeOf(new EngineRefused("Not your turn")), "failed");
});

test("every game codes 'Not your turn'", () => {
  for (const [kind, game] of allGames()) {
    assert.equal(game.engineCode?.("Not your turn"), "not-your-turn", kind);
  }
});

test("an internal failure never sends its own message out", () => {
  assert.equal(messageOf(new Error("ENGINE_TOKEN is required"), "Action failed"), "Action failed");
  assert.equal(messageOf(new EngineFailed("getaddrinfo ENOTFOUND poker-engine.railway.internal"), "Action failed"), "Action failed");
  assert.equal(messageOf(new TableRefused("invalid", "Table is paused", REFUSAL.paused), "x"), "Table is paused");
});
