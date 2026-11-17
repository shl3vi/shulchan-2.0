import assert from "node:assert/strict";
import test from "node:test";
import { publish } from "./bus.js";
import { listenErrorCount, takeErrorCounts } from "./errorCount.js";

listenErrorCount();

test("errors are counted by area, and player mistakes apart from real errors", () => {
  takeErrorCounts();
  publish({ name: "error", data: { area: "store" } });
  publish({ name: "error", data: { area: "store" } });
  publish({ name: "error", data: { area: "action" } });
  publish({ name: "error", data: { area: "validation" } });
  publish({ name: "error", data: { area: "forbidden" } });
  publish({ name: "session.summary", data: { games: 3 } });
  assert.deepEqual(takeErrorCounts(), {
    errors: 3,
    playerErrors: 2,
    errors_store: 2,
    errors_action: 1,
    errors_validation: 1,
    errors_forbidden: 1,
  });
});

test("taking the counts starts the next five minutes from zero", () => {
  publish({ name: "error", data: { area: "video" } });
  takeErrorCounts();
  assert.deepEqual(takeErrorCounts(), { errors: 0, playerErrors: 0 });
});
