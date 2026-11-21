import assert from "node:assert/strict";
import test from "node:test";
import { readOneConfig, readPublicConfig } from "../../publicConfig.js";

test("poker reads its own section, with defaults and limits", () => {
  const config = readOneConfig({ games: { poker: { autoDealDefault: false, turnSecondsDefault: 999 } } });
  assert.equal(config.games.poker.autoDealDefault, false);
  assert.equal(config.games.poker.turnSecondsDefault, 300);
  const fallback = readPublicConfig("{").default.games.poker;
  assert.equal(fallback.autoDealDefault, true);
  assert.equal(fallback.turnSecondsDefault, 30);
});

test("the older top-level poker section is still read", () => {
  const old = readOneConfig({ poker: { autoDealDefault: false, turnSecondsDefault: 45 } });
  assert.equal(old.games.poker.autoDealDefault, false);
  assert.equal(old.games.poker.turnSecondsDefault, 45);
});
