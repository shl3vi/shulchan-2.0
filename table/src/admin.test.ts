import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_AWAY_MS, settleAdmin } from "./admin.js";

const first = <T,>(items: T[]) => items[0]!;

function table(adminId?: string) {
  return {
    adminId,
    adminAwaySince: undefined as number | undefined,
    players: [{ id: "a" }, { id: "b" }, { id: "c", pendingRemoval: true }],
  };
}

test("a connected admin keeps the role and nothing is written", () => {
  const t = table("a");
  assert.equal(settleAdmin(t, new Set(["a", "b"]), 0, first), false);
  assert.equal(t.adminId, "a");
});

test("a short drop starts the wait but keeps the admin", () => {
  const t = table("a");
  assert.equal(settleAdmin(t, new Set(["b"]), 1000, first), true);
  assert.equal(t.adminAwaySince, 1000);
  assert.equal(settleAdmin(t, new Set(["b"]), 1000 + ADMIN_AWAY_MS - 1, first), false);
  assert.equal(t.adminId, "a");
});

test("the admin coming back clears the wait", () => {
  const t = table("a");
  settleAdmin(t, new Set(["b"]), 0, first);
  assert.equal(settleAdmin(t, new Set(["a"]), 5000, first), true);
  assert.equal(t.adminAwaySince, undefined);
  assert.equal(t.adminId, "a");
});

test("after the wait a connected player takes over", () => {
  const t = table("a");
  settleAdmin(t, new Set(["b"]), 0, first);
  assert.equal(settleAdmin(t, new Set(["b"]), ADMIN_AWAY_MS, first), true);
  assert.equal(t.adminId, "b");
  assert.equal(t.adminAwaySince, undefined);
});

test("nobody connected: the admin keeps the role until someone is", () => {
  const t = table("a");
  settleAdmin(t, new Set(), 0, first);
  assert.equal(settleAdmin(t, new Set(), ADMIN_AWAY_MS * 3, first), false);
  assert.equal(t.adminId, "a");
  assert.equal(settleAdmin(t, new Set(["b"]), ADMIN_AWAY_MS * 3, first), true);
  assert.equal(t.adminId, "b");
});

test("a player on their way out is never chosen", () => {
  const t = table("a");
  settleAdmin(t, new Set(["c"]), 0, first);
  assert.equal(settleAdmin(t, new Set(["c"]), ADMIN_AWAY_MS, first), false);
  assert.equal(t.adminId, "a");
});

test("a table with no admin gets a connected one at once", () => {
  const t = table(undefined);
  assert.equal(settleAdmin(t, new Set(["b"]), 0, first), true);
  assert.equal(t.adminId, "b");
});
