import assert from "node:assert/strict";
import test from "node:test";
import { call, join, nothing, phone, rawSocket, snapshot, tableWith, waitFor } from "./helpers.mts";

const errorWith = (code: string) => (body: { code?: string }) => body.code === code;

test("a socket with a wrong secret or table is refused", async () => {
  const { table, admin } = await tableWith([]);
  for (const auth of [
    { gameId: table.gameId, playerId: admin.id, playerSecret: "wrong" },
    { gameId: "NOPE99", playerId: admin.id, playerSecret: admin.secret },
    { gameId: table.gameId, playerId: "someone", playerSecret: admin.secret },
  ]) {
    const socket = rawSocket(auth);
    const [error] = await Promise.all([waitFor(socket, "error"), waitFor(socket, "disconnect")]);
    assert.equal(error.message, "Invalid connection");
    assert.equal(error.code, "not-seated");
  }
});

test("a seated player gets their own view on connect, and everyone hears a new player", async () => {
  const { table, admin } = await tableWith([]);
  const adminPhone = await phone(table, admin);
  assert.equal(adminPhone.state.id, table.gameId);
  assert.deepEqual(adminPhone.state.you, { id: admin.id, isAdmin: true });

  const heard = adminPhone.next("state", (state) => state.players.length === 2);
  const bob = await join(table, "Bob");
  const state = await heard;
  assert.deepEqual(state.players.map((p: { name: string }) => p.name).sort(), ["Admin", "Bob"]);
  const bobPhone = await phone(table, bob);
  assert.deepEqual(bobPhone.state.you, { id: bob.id, isAdmin: false });
});

test("poker: only the admin deals, then only the player to act can act", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);

  bobPhone.socket.emit("move", { type: "deal" });
  const refused = await bobPhone.next("error");
  assert.equal(refused.code, "not-admin");
  await nothing(adminPhone.socket, "state", (state) => state.status.phase === "playing");

  const dealt = Promise.all([
    adminPhone.next("state", (state) => state.status.phase === "playing"),
    bobPhone.next("state", (state) => state.status.phase === "playing"),
  ]);
  adminPhone.socket.emit("move", { type: "deal" });
  const [forAdmin] = await dealt;
  assert.equal(forAdmin.status.toAct.length, 1);

  const toAct = forAdmin.status.toAct[0] as string;
  const [actor, waiting] = toAct === admin.id ? [adminPhone, bobPhone] : [bobPhone, adminPhone];
  waiting.socket.emit("move", { type: "act", action: "fold" });
  const notYours = await waiting.next("error");
  assert.ok(notYours.message, "acting out of turn is refused with a message");
  assert.equal(notYours.code, "not-your-turn", "the engine's refusal reaches the phone as a code");

  const moved = actor.next("state", (state) => state.status.toAct[0] !== toAct || state.status.phase !== "playing");
  actor.socket.emit("move", { type: "act", action: "fold" });
  await moved;
});

test("moves are checked before they reach the game", async () => {
  const { table, admin } = await tableWith([]);
  const adminPhone = await phone(table, admin);
  adminPhone.socket.emit("move", { type: "teleport" });
  assert.equal((await adminPhone.next("error")).message, "Unknown move");
  adminPhone.socket.emit("move", { type: "act", action: "shove" });
  assert.equal((await adminPhone.next("error")).message, "Invalid request");
  adminPhone.socket.emit("move", { type: "act", action: "bet", amount: -5 });
  assert.equal((await adminPhone.next("error")).code, "invalid");
  adminPhone.socket.emit("move", "not an object");
  assert.equal((await adminPhone.next("error")).message, "Unknown move");
  adminPhone.socket.emit("move", { type: "roll" });
  assert.equal((await adminPhone.next("error")).message, "Unknown move", "a backgammon move at a poker table");
});

test("pause is for the admin, and a paused table refuses moves", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);

  bobPhone.socket.emit("pause", { paused: true });
  assert.equal((await bobPhone.next("error")).code, "not-admin");
  bobPhone.socket.emit("pause", { paused: "yes" });
  assert.equal((await bobPhone.next("error")).code, "invalid");

  const paused = bobPhone.next("state", (state) => state.paused === true);
  adminPhone.socket.emit("pause", { paused: true });
  await paused;
  adminPhone.socket.emit("move", { type: "deal" });
  assert.equal((await adminPhone.next("error")).code, "paused");

  const resumed = bobPhone.next("state", (state) => state.paused === false);
  adminPhone.socket.emit("pause", { paused: false });
  await resumed;
});

test("leave frees the seat, sends the leaver away and hands admin on", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);

  const kicked = waitFor(adminPhone.socket, "kicked");
  const bobSees = bobPhone.next("state", (state) => state.players.length === 1);
  adminPhone.socket.emit("leave");
  await kicked;
  const state = await bobSees;
  assert.deepEqual(state.you, { id: bob.id, isAdmin: true });
  assert.equal((await snapshot(table, admin)).status, 401, "the old seat's secret no longer works");
});

test("only the admin removes a player, and the removed player's password stops working", async () => {
  const { table, admin, others: [bob, carol] } = await tableWith(["Bob", "Carol"]);
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);
  const carolPhone = await phone(table, carol);

  bobPhone.socket.emit("remove-player", { playerId: carol.id });
  assert.equal((await bobPhone.next("error")).code, "not-admin");
  adminPhone.socket.emit("remove-player", {});
  assert.equal((await adminPhone.next("error")).code, "invalid");

  const carolKicked = waitFor(carolPhone.socket, "kicked");
  const adminSees = adminPhone.next("state", (state) => state.players.length === 2);
  adminPhone.socket.emit("remove-player", { playerId: carol.id });
  await carolKicked;
  const after = await adminSees;
  assert.notEqual(after.password, table.password, "a new password, so the removed player can't rejoin");
  const rejoin = await call(`/api/games/${table.gameId}/join`, { body: { name: "Carol", password: table.password, personKey: carol.personKey } });
  assert.equal(rejoin.status, 403);
});

test("the admin can hand admin to an app player, not to a browser guest", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const guest = await join(table, "Guest", {}, { headers: { origin: "https://loochka.com" } });
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);

  adminPhone.socket.emit("transfer-admin", { playerId: guest.id });
  const browserAdmin = await adminPhone.next("error");
  assert.equal(browserAdmin.message, "A player in the browser cannot be admin");
  assert.equal(browserAdmin.code, "browser-admin");
  bobPhone.socket.emit("transfer-admin", { playerId: bob.id });
  assert.equal((await bobPhone.next("error")).code, "not-admin");

  const handed = bobPhone.next("state", (state) => state.you.isAdmin === true);
  adminPhone.socket.emit("transfer-admin", { playerId: bob.id });
  await handed;
  assert.equal((await snapshot(table, admin)).json.you.isAdmin, false);
});

test("backgammon: a two-player table plays its first roll", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"], { kind: "backgammon" });
  const adminPhone = await phone(table, admin);
  const bobPhone = await phone(table, bob);
  assert.equal(adminPhone.state.game.kind, "backgammon");

  const toAct = adminPhone.state.status.toAct as string[];
  assert.equal(toAct.length, 1, "one player rolls first");
  const [actor, other] = toAct[0] === admin.id ? [adminPhone, bobPhone] : [bobPhone, adminPhone];
  const before = JSON.stringify(other.state.game.board);
  const rolled = other.next("state", (state) => JSON.stringify(state.game.board) !== before);
  actor.socket.emit("move", { type: "roll" });
  const after = await rolled;
  assert.equal(after.game.board.rolls, 1);
});

test("a player who floods events is slowed down", async () => {
  const { table, admin } = await tableWith([]);
  const adminPhone = await phone(table, admin);
  // The test server runs with SOCKET_EVENT_LIMIT=40.
  const tooMany = adminPhone.next("error", errorWith("too-many"));
  for (let i = 0; i < 45; i++) adminPhone.socket.emit("move", { type: "teleport" });
  await tooMany;
});
