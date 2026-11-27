import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Read as text: the app's modules use the "@/" alias, which plain node cannot load.
const src = join(import.meta.dirname, "..");
const server = join(src, "../../table/src");
const read = (path: string) => readFileSync(path, "utf8");

/** code → catalog key, from a `Record<string, MessageKey>` written as `"code": "key",` lines. */
function mapOf(text: string) {
  return new Map([...text.matchAll(/^\s+"?([a-z][a-z.-]*)"?: "([A-Za-z]+)",$/gm)].map((m) => [m[1]!, m[2]!]));
}

const shared = mapOf(read(join(src, "game/errors.ts")));
const games = readdirSync(join(src, "games"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const gameMaps = new Map(games.map((kind) => [kind, mapOf(read(join(src, "games", kind, "errors.ts")))]));
const catalog = read(join(src, "i18n/index.ts"));

test("every code the server sends has words in the app", () => {
  const sharedCodes = [...read(join(server, "errors.ts")).matchAll(/^\s+[a-zA-Z]+: "([a-z-]+)",$/gm)].map((m) => m[1]!);
  assert.ok(sharedCodes.length > 30);
  for (const code of sharedCodes) assert.ok(shared.has(code), `shared code ${code}`);
  for (const kind of games) {
    const folder = join(server, "games", kind);
    const text = readdirSync(folder).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")).map((file) => read(join(folder, file))).join("\n");
    for (const [, code] of text.matchAll(new RegExp(`"(${kind}\\.[a-z-]+)"`, "g"))) {
      assert.ok(gameMaps.get(kind)!.has(code!), `${kind} code ${code}`);
    }
  }
});

test("every error's words exist in all five languages", () => {
  const keys = new Set([...shared.values(), ...[...gameMaps.values()].flatMap((map) => [...map.values()])]);
  for (const key of keys) {
    const count = catalog.match(new RegExp(`^    ${key}: "`, "gm"))?.length ?? 0;
    assert.equal(count, 5, key);
  }
});
