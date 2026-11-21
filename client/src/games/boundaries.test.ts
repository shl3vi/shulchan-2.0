import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Keeps each game in its own folder. Shared code reaches a game only through
 * games/registry.ts and games/types.ts, and no game reaches into another.
 *
 * Each entry below is a known exception, written "from -> to". The test also fails when an
 * entry is no longer needed, so the list can only shrink.
 */
const ALLOWED = new Set<string>([]);

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Imports as paths under src, without an extension. Only the app's own modules count. */
function importsOf(file: string) {
  const text = readFileSync(file, "utf8");
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']((?:@\/|\.{1,2}\/)[^"']+)["']/g)) {
    const spec = match[1]!;
    if (spec.startsWith("@/assets/")) continue;
    const target = spec.startsWith("@/") ? join(src, spec.slice(2)) : resolve(dirname(file), spec);
    found.add(relative(src, target).replace(/\.(ts|tsx)$/, ""));
  }
  return [...found];
}

/** "shared", "list", "contract", or the game's folder name. */
function areaOf(path: string) {
  const bare = path.replace(/\.(test\.)?(ts|tsx)$/, "");
  // This test reads every game's files, so it counts as part of the list.
  if (bare === "games/registry" || bare === "games/boundaries") return "list";
  if (bare === "games/types") return "contract";
  const game = /^games\/([^/]+)(\/|$)/.exec(bare)?.[1];
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
