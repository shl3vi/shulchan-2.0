import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";

// engines.ts refuses to load without a token.
process.env.ENGINE_TOKEN ??= "test-token";
const { ENGINE_TIMEOUT_MS, EngineTimeout, enginePost } = await import("./engines.js");

let server: Server;
let base = "";

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/fast") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/refuse") {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Not your turn" }));
      return;
    }
    if (req.url === "/half") {
      // Headers arrive at once, then the body never finishes.
      res.setHeader("content-type", "application/json");
      res.write("{\"ok\":");
      return;
    }
    // "/hang": never answers.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test("the engine timeout stays well inside the 5 second table lock", () => {
  assert.ok(ENGINE_TIMEOUT_MS <= 2500);
});

test("a normal answer comes back unchanged", async () => {
  assert.deepEqual(await enginePost(base, "/fast"), { ok: true });
});

test("an engine refusal keeps its own message", async () => {
  await assert.rejects(enginePost(base, "/refuse"), /Not your turn/);
});

test("an engine that never answers fails after the timeout, not later", async () => {
  const started = Date.now();
  await assert.rejects(enginePost(base, "/hang"), EngineTimeout);
  const waited = Date.now() - started;
  assert.ok(waited >= ENGINE_TIMEOUT_MS - 50 && waited < ENGINE_TIMEOUT_MS + 1000, `waited ${waited} ms`);
});

test("an answer that stalls halfway also fails after the timeout", async () => {
  const started = Date.now();
  await assert.rejects(enginePost(base, "/half"), EngineTimeout);
  assert.ok(Date.now() - started < ENGINE_TIMEOUT_MS + 1000);
});
