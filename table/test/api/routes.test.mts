import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { call, db, join, newIp, openTable, signedInHost, snapshot, tableWith } from "./helpers.mts";

const poker = { kind: "poker", smallBlind: 5, buyIn: 500 };

test("opening a table needs a signed-in host", async () => {
  assert.equal((await call("/api/games", { body: poker })).status, 401);
  assert.equal((await call("/api/games", { body: poker, headers: { authorization: "Bearer nope" } })).status, 401);
});

test("opening a table checks the game and its settings", async () => {
  const host = await signedInHost();
  assert.equal((await call("/api/games", { body: { kind: "chess" }, headers: host.auth })).status, 400);
  assert.equal((await call("/api/games", { body: { kind: "poker", smallBlind: 0, buyIn: 500 }, headers: host.auth })).status, 400);
  assert.equal((await call("/api/games", { body: { kind: "poker", smallBlind: 50, buyIn: 60 }, headers: host.auth })).status, 400);
  assert.equal((await call("/api/games", { body: { ...poker, extra: true }, headers: host.auth })).status, 400);
});

test("every game opens, with a six-character code and a six-digit password", async () => {
  for (const kind of ["poker", "backgammon", "dice", "tiles"]) {
    const host = await signedInHost();
    const body = kind === "poker" ? poker : { kind };
    const response = await call("/api/games", { body, headers: host.auth });
    assert.equal(response.status, 201, `${kind}: ${response.text}`);
    assert.match(response.json.gameId, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.match(response.json.password, /^\d{6}$/);
    assert.equal(response.json.state.game.kind, kind);
    assert.deepEqual(response.json.state.players, []);
  }
});

test("a host can have two tables open, not three", async () => {
  const host = await signedInHost();
  assert.equal((await call("/api/games", { body: poker, headers: host.auth })).status, 201);
  assert.equal((await call("/api/games", { body: poker, headers: host.auth })).status, 201);
  const third = await call("/api/games", { body: poker, headers: host.auth });
  assert.equal(third.status, 429);
  assert.equal(third.json.error, "You already have two tables open");
  assert.equal(third.json.code, "table-limit");
});

test("join checks the body, the name, the table and the password", async () => {
  const table = await openTable();
  const personKey = randomUUID();
  const path = `/api/games/${table.gameId}/join`;
  assert.equal((await call(path, { body: { name: "Ann" } })).status, 400);
  assert.equal((await call(path, { body: { name: "Ann", password: table.password, personKey: "not-a-uuid" } })).status, 400);
  assert.equal((await call(path, { body: { name: "Ann", password: table.password, personKey, admin: true } })).status, 400);
  assert.equal((await call(path, { body: { name: "   ", password: table.password, personKey } })).status, 400);
  assert.equal((await call(`/api/games/NOPE99/join`, { body: { name: "Ann", password: "123456", personKey } })).status, 404);
  const wrong = table.password === "111111" ? "222222" : "111111";
  const refused = await call(path, { body: { name: "Ann", password: wrong, personKey } });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.error, "Wrong password");
  assert.equal(refused.json.code, "wrong-password");
});

test("the player holding the admin secret becomes admin, and a browser guest never does", async () => {
  const table = await openTable();
  const guest = await join(table, "Guest", {}, { headers: { origin: "https://loochka.com" } });
  const admin = await join(table, "Host", { adminSecret: table.adminSecret });
  const other = await join(table, "Other");

  const asAdmin = (await snapshot(table, admin)).json;
  assert.deepEqual(asAdmin.you, { id: admin.id, isAdmin: true });
  assert.equal(asAdmin.password, table.password);
  assert.equal(asAdmin.players.find((p: { id: string }) => p.id === guest.id).web, true);

  const asOther = (await snapshot(table, other)).json;
  assert.deepEqual(asOther.you, { id: other.id, isAdmin: false });
  assert.equal(asOther.password, undefined, "only the admin sees the table password");
  const asGuest = (await snapshot(table, guest)).json;
  assert.equal(asGuest.you.isAdmin, false);
});

test("the first app player becomes admin when nobody holds the secret", async () => {
  const table = await openTable();
  const first = await join(table, "First");
  const second = await join(table, "Second");
  assert.equal((await snapshot(table, first)).json.you.isAdmin, true);
  assert.equal((await snapshot(table, second)).json.you.isAdmin, false);
});

test("a table seats nine and refuses the tenth", async () => {
  const table = await openTable();
  for (let i = 1; i <= 9; i++) await join(table, `P${i}`);
  const tenth = await call(`/api/games/${table.gameId}/join`, { body: { name: "P10", password: table.password, personKey: randomUUID() } });
  assert.equal(tenth.status, 400);
  assert.equal(tenth.json.error, "Table is full");
  assert.equal(tenth.json.code, "table-full");
});

test("too many wrong passwords from one address lock that address out, and only it", async () => {
  const table = await openTable();
  const ip = newIp();
  const wrong = table.password === "111111" ? "222222" : "111111";
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const response = await call(`/api/games/${table.gameId}/join`, { ip, body: { name: "Guess", password: wrong, personKey: randomUUID() } });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses, [403, 403, 403, 403, 403, 429]);
  const locked = await call(`/api/games/${table.gameId}/join`, { ip, body: { name: "Guess", password: table.password, personKey: randomUUID() } });
  assert.equal(locked.status, 429, "even the right password waits out the lock");
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  // Someone else at the same table is not locked out by it.
  await join(table, "Friend");
});

test("reading a table needs a seat or the password", async () => {
  const { table, admin } = await tableWith([]);
  const path = `/api/games/${table.gameId}`;
  assert.equal((await call(path)).status, 401);
  assert.equal((await call("/api/games/NOPE99", { headers: { "x-table-password": "123456" } })).status, 404);
  const wrong = table.password === "111111" ? "222222" : "111111";
  assert.equal((await call(path, { headers: { "x-table-password": wrong } })).status, 401);
  assert.equal((await call(path, { headers: { "x-player-id": admin.id, "x-player-secret": "wrong" } })).status, 401);

  const outside = await call(path, { headers: { "x-table-password": table.password } });
  assert.equal(outside.status, 200);
  assert.equal(outside.json.you, null);
  assert.equal(outside.json.password, undefined);
  assert.equal(outside.json.players.length, 1);
  assert.equal("secret" in outside.json.players[0], false, "a player's secret is never in a snapshot");
  assert.equal("personKey" in outside.json.players[0], false);
});

test("report stores the report, and only a seated player can send one", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const path = `/api/games/${table.gameId}/report`;
  assert.equal((await call(path, { body: { playerId: admin.id, secret: admin.secret, targetId: bob.id, reason: "spam" } })).status, 400);
  assert.equal((await call(path, { body: { playerId: admin.id, secret: "wrong", targetId: bob.id, reason: "name" } })).status, 401);
  assert.equal((await call(path, { body: { playerId: admin.id, secret: admin.secret, targetId: admin.id, reason: "name" } })).status, 401, "not yourself");
  assert.equal((await call(path, { body: { playerId: admin.id, secret: admin.secret, targetId: "nobody", reason: "name" } })).status, 401);

  const sent = await call(path, { body: { playerId: admin.id, secret: admin.secret, targetId: bob.id, reason: "camera" } });
  assert.equal(sent.status, 200);
  const rows = await db.query("SELECT reporter_key, reporter_name, reported_key, reported_name, reason FROM reports WHERE table_id = $1", [table.gameId]);
  assert.deepEqual(rows.rows, [{ reporter_key: admin.personKey, reporter_name: "Admin", reported_key: bob.personKey, reported_name: "Bob", reason: "camera" }]);
});

test("block hides the other player for the blocker only, and unblock undoes it", async () => {
  const { table, admin, others: [bob] } = await tableWith(["Bob"]);
  const body = { playerId: admin.id, secret: admin.secret, targetId: bob.id };
  assert.equal((await call(`/api/games/${table.gameId}/block`, { body: { ...body, secret: "wrong" } })).status, 401);
  assert.equal((await call(`/api/games/${table.gameId}/block`, { body })).status, 200);

  const blockedFor = async (seat: typeof admin) =>
    (await snapshot(table, seat)).json.players.filter((p: { blocked?: boolean }) => p.blocked).map((p: { id: string }) => p.id);
  assert.deepEqual(await blockedFor(admin), [bob.id]);
  assert.deepEqual(await blockedFor(bob), []);

  assert.equal((await call(`/api/games/${table.gameId}/unblock`, { body })).status, 200);
  assert.deepEqual(await blockedFor(admin), []);
});

test("a video token needs a seated player, and says so when video is off", async () => {
  const { table, admin } = await tableWith([]);
  const path = `/api/games/${table.gameId}/livekit`;
  assert.equal((await call("/api/games/NOPE99/livekit", { body: { playerId: admin.id, secret: admin.secret } })).status, 404);
  assert.equal((await call(path, { body: {} })).status, 400);
  assert.equal((await call(path, { body: { playerId: admin.id, secret: "wrong" } })).status, 401);
  const off = await call(path, { body: { playerId: admin.id, secret: admin.secret } });
  assert.equal(off.status, 503);
  assert.equal(off.json.error, "Video is not available");
  assert.equal(off.json.code, "video-off");
});

test("public pages, config and the join page answer", async () => {
  for (const page of ["/", "/privacy", "/terms", "/support", "/account"]) {
    const response = await call(page);
    assert.equal(response.status, 200, page);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/, page);
  }
  const config = await call("/api/config");
  assert.equal(config.status, 200);
  assert.equal(typeof config.json, "object");

  const joinPage = await call("/join?game=ABC234&password=123456", { headers: { "accept-language": "he-IL,he;q=0.9" } });
  assert.equal(joinPage.status, 200);
  assert.match(joinPage.text, /lang="he" dir="rtl"/);
  assert.match(joinPage.text, /shulchan:\/\/join\?game=ABC234&amp;password=123456/);
  const injected = await call(`/join?game=${encodeURIComponent("\"><script>alert(1)</script>")}`);
  assert.doesNotMatch(injected.text, /<script>alert\(1\)<\/script>/);
});

test("one address gets a fixed number of requests a minute, and /health is not counted", async () => {
  const ip = newIp();
  // The test server runs with RATE_LIMIT=30.
  for (let i = 0; i < 40; i++) assert.equal((await call("/health", { ip })).status, 200);
  const statuses: number[] = [];
  for (let i = 0; i < 31; i++) statuses.push((await call("/api/config", { ip })).status);
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill(200));
  assert.equal(statuses[30], 429);
  assert.equal((await call("/api/config")).status, 200, "another address is not affected");
});

test("CORS allows no origin that is not configured", async () => {
  const response = await call("/api/config", { headers: { origin: "https://evil.example" } });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
