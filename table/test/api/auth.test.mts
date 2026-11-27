import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { call, db, newIp, openTable, pkce, redis, signedInHost } from "./helpers.mts";

/** The code /auth/callback leaves in Redis once Google has confirmed the user. */
async function googleCode(challenge: string, profile = { sub: "google-sub-1", email: "player@example.com", name: "Pat" }) {
  const code = randomBytes(32).toString("hex");
  await redis.set(`oauth-code:${code}`, JSON.stringify({ ...profile, challenge }), { EX: 60 });
  return code;
}

test("health reports Redis, Postgres and every engine", async () => {
  const response = await call("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true, redis: true, postgres: true, poker: true, backgammon: true, dice: true, tiles: true });
});

test("/auth/host refuses a missing, malformed or unknown token", async () => {
  assert.equal((await call("/auth/host")).status, 401);
  assert.equal((await call("/auth/host", { headers: { authorization: "Token abc" } })).status, 401);
  assert.equal((await call("/auth/host", { headers: { authorization: `Bearer ${randomBytes(32).toString("hex")}` } })).status, 401);
});

test("/auth/host answers a signed-in host with their email and name", async () => {
  const host = await signedInHost("someone@example.com");
  const response = await call("/auth/host", { headers: host.auth });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { email: "someone@example.com", name: "Test Host" });
});

test("Google sign-in starts only with the app's return link and a PKCE challenge", async () => {
  const { challenge } = pkce();
  const ip = newIp();
  const bad = await call(`/auth/google?challenge=${challenge}&return=${encodeURIComponent("https://evil.example/auth")}`, { ip, redirect: "manual" });
  assert.equal(bad.status, 400);
  const noChallenge = await call("/auth/google", { ip: newIp(), redirect: "manual" });
  assert.equal(noChallenge.status, 400);

  const ok = await call(`/auth/google?challenge=${challenge}`, { ip: newIp(), redirect: "manual" });
  assert.equal(ok.status, 302);
  const location = new URL(ok.headers.get("location") ?? "");
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("client_id"), "test-client.apps.googleusercontent.com");
  const state = location.searchParams.get("state") ?? "";
  assert.match(state, /^[a-f0-9]{32}$/);
  const pending = JSON.parse((await redis.get(`oauth:${state}`)) ?? "null");
  assert.deepEqual(pending, { back: "shulchan://auth", challenge });
});

test("Google sign-in is limited per address", async () => {
  const ip = newIp();
  const { challenge } = pkce();
  for (let i = 0; i < 3; i++) {
    assert.equal((await call(`/auth/google?challenge=${challenge}`, { ip, redirect: "manual" })).status, 302);
  }
  const over = await call(`/auth/google?challenge=${challenge}`, { ip, redirect: "manual" });
  assert.equal(over.status, 429);
  // Another address is not affected.
  assert.equal((await call(`/auth/google?challenge=${challenge}`, { redirect: "manual" })).status, 302);
});

test("the Google callback refuses an unknown or reused state", async () => {
  const response = await call(`/auth/callback?code=abc&state=${randomBytes(16).toString("hex")}`, { redirect: "manual" });
  assert.equal(response.status, 400);
});

test("a sign-in code is redeemed once, and only with the matching verifier", async () => {
  const { verifier, challenge } = pkce();
  const wrong = pkce().verifier;

  const code = await googleCode(challenge);
  const stolen = await call("/auth/session", { body: { code, verifier: wrong } });
  assert.equal(stolen.status, 401);
  // A wrong verifier burns the code, so whoever caught it can't keep guessing.
  assert.equal((await call("/auth/session", { body: { code, verifier } })).status, 401);

  const fresh = await googleCode(challenge);
  const session = await call("/auth/session", { body: { code: fresh, verifier } });
  assert.equal(session.status, 200);
  assert.equal(session.json.email, "player@example.com");
  assert.equal(session.json.name, "Pat");
  assert.match(session.json.token, /^[a-f0-9]{64}$/);
  assert.equal((await call("/auth/session", { body: { code: fresh, verifier } })).status, 401);

  const host = await call("/auth/host", { headers: { authorization: `Bearer ${session.json.token}` } });
  assert.equal(host.status, 200);
  assert.equal(host.json.email, "player@example.com");
});

test("/auth/session refuses a malformed body", async () => {
  assert.equal((await call("/auth/session", { body: {} })).status, 400);
  assert.equal((await call("/auth/session", { body: { code: "short", verifier: pkce().verifier } })).status, 400);
  assert.equal((await call("/auth/session", { body: { code: randomBytes(32).toString("hex"), verifier: "x" } })).status, 400);
});

test("Apple sign-in refuses a malformed identity token without calling Apple", async () => {
  assert.equal((await call("/auth/apple", { body: {} })).status, 400);
  assert.equal((await call("/auth/apple", { body: { identityToken: "not-a-jwt-but-long-enough" } })).status, 401);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const wrongIssuer = `${encode({ alg: "RS256", kid: "k" })}.${encode({ iss: "https://evil.example", aud: "com.loochka", sub: "x", exp: 9e9 })}.c2ln`;
  assert.equal((await call("/auth/apple", { body: { identityToken: wrongIssuer } })).status, 401);
  const expired = `${encode({ alg: "RS256", kid: "k" })}.${encode({ iss: "https://appleid.apple.com", aud: "com.loochka", sub: "x", exp: 1 })}.c2ln`;
  assert.equal((await call("/auth/apple", { body: { identityToken: expired } })).status, 401);
  const noneAlg = `${encode({ alg: "none" })}.${encode({ iss: "https://appleid.apple.com", aud: "com.loochka", sub: "x", exp: 9e9 })}.`;
  assert.equal((await call("/auth/apple", { body: { identityToken: noneAlg } })).status, 401);
});

test("deleting the account signs the host out and closes their tables", async () => {
  assert.equal((await call("/auth/account", { method: "DELETE" })).status, 401);
  const table = await openTable();
  const response = await call("/auth/account", { method: "DELETE", headers: table.host.auth });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true });
  assert.equal((await call("/auth/host", { headers: table.host.auth })).status, 401);
  assert.equal((await call(`/api/games/${table.gameId}`, { headers: { "x-table-password": table.password } })).status, 404);
  assert.equal((await call("/api/games", { body: { kind: "poker", smallBlind: 5, buyIn: 500 }, headers: table.host.auth })).status, 401);
});

test("a sign-in is kept in Postgres for 30 days, as a hash of the token, and not in Redis", async () => {
  const { verifier, challenge } = pkce();
  const code = await googleCode(challenge, { sub: "google-sub-30", email: "thirty@example.com", name: "Thirty" });
  const session = await call("/auth/session", { body: { code, verifier } });
  assert.equal(session.status, 200);
  const token: string = session.json.token;
  assert.equal(await redis.get(`host:${token}`), null);
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await db.query<{ email: string; days: number }>(
    "SELECT email, extract(epoch FROM expires_at - now()) / 86400 AS days FROM host_sessions WHERE token_hash = $1",
    [hash],
  );
  assert.equal(rows.rows[0]?.email, "thirty@example.com");
  assert.ok(Number(rows.rows[0]?.days) > 29.9 && Number(rows.rows[0]?.days) <= 30);
  const none = await db.query("SELECT 1 FROM host_sessions WHERE token_hash = $1", [token]);
  assert.equal(none.rowCount, 0);
});
