import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Keeps each game in its own folder. Shared code reaches a game only through
 * games/index.ts and games/types.ts, and no game reaches into another.
 *
 * Each entry below is a known exception, written "from -> to". The test also fails when an
 * entry is no longer needed, so the list can only shrink.
 */
const ALLOWED = new Set<string>([
  // The stored table record still carries poker's hand, view and turn clock.
  "store.ts -> games/poker/engine.ts",
  "store.ts -> games/poker/turn.ts",
  // The app config still has a poker section with turn-time bounds.
  "publicConfig.ts -> games/poker/turn.ts",
  // Backgammon tables still run a hidden poker hand for seats and the snapshot.
  "games/backgammon/debug.ts -> games/poker/hiddenHand.ts",
  "games/backgammon/index.ts -> games/poker/hiddenHand.ts",
]);

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|mts)$/.test(name) ? [path] : [];
  });
}

function importsOf(file: string) {
  const text = readFileSync(file, "utf8");
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1]!).replace(/\.js$/, ".ts");
    found.add(relative(src, target));
  }
  return [...found];
}

/** "shared", "list", "contract", or the game's folder name. */
function areaOf(path: string) {
  // This test loads every game through the list, so it counts as part of the list.
  if (path === "games/index.ts" || path === "games/boundaries.test.ts") return "list";
  if (path === "games/types.ts") return "contract";
  const game = /^games\/([^/]+)\//.exec(path)?.[1];
  return game ?? "shared";
}

function problem(from: string, to: string) {
  const a = areaOf(from);
  const b = areaOf(to);
  if (a === "list" || b === "contract" || b === "shared" || a === b) return null;
  if (a === "shared" && b === "list") return null;
  if (a === "shared") return "shared code imports a game folder";
  if (a === "contract") return "the contract imports a game";
  if (b === "list") return "a game imports the list of games";
  return "one game imports another";
}

test("shared code reaches games only through the list, and games do not reach each other", () => {
  const broken: string[] = [];
  const used = new Set<string>();
  for (const file of sourceFiles(src)) {
    const from = relative(src, file);
    for (const to of importsOf(file)) {
      const reason = problem(from, to);
      if (!reason) continue;
      const pair = `${from} -> ${to}`;
      if (ALLOWED.has(pair)) {
        used.add(pair);
        continue;
      }
      broken.push(`${pair} (${reason})`);
    }
  }
  assert.deepEqual(broken, [], "Imports that cross a game boundary");
  const stale = [...ALLOWED].filter((pair) => !used.has(pair));
  assert.deepEqual(stale, [], "Exceptions no longer needed. Remove them from ALLOWED");
});

test("every game in the list loads and fills the contract", async () => {
  process.env.ENGINE_TOKEN ??= "test-token";
  const { allGames } = await import("./index.js");
  const games = allGames();
  assert.ok(games.length > 0);
  for (const [kind, game] of games) {
    assert.ok(game.seats.max > 0, `${kind} has seats`);
    for (const hook of ["settings", "open", "chooseSeat", "seat", "unseat", "dropDeparted", "snapshot", "health"] as const) {
      assert.equal(typeof game[hook], "function", `${kind}.${hook}`);
    }
    assert.ok(Object.keys(game.moves).length > 0, `${kind} has moves`);
  }
});
