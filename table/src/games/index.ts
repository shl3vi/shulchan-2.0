import { backgammon } from "./backgammon/index.js";
import { poker } from "./poker/index.js";
import type { GameModule } from "./types.js";

/** The list of games. Adding or removing a game is one line here. */
export const games = { poker, backgammon } satisfies Record<string, GameModule<any>>;

export type GameKind = keyof typeof games;

/** A table saved before tables had a kind is the first game in the list. */
const DEFAULT_KIND = Object.keys(games)[0] as GameKind;

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && Object.hasOwn(games, value);
}

export function kindOf(table: { kind?: string }): GameKind {
  return isGameKind(table.kind) ? table.kind : DEFAULT_KIND;
}

export function gameFor(kind: GameKind): GameModule<any> {
  return games[kind];
}

export function gameOf(table: { kind?: string }): GameModule<any> {
  return gameFor(kindOf(table));
}

/** Reads the kind from the body of "open a table". No kind means the first game; an unknown one is refused. */
export function requestedKind(body: unknown): GameKind | null {
  const kind = typeof body === "object" && body !== null ? (body as { kind?: unknown }).kind : undefined;
  if (kind === undefined) return DEFAULT_KIND;
  return isGameKind(kind) ? kind : null;
}

export function allGames() {
  return Object.entries(games) as [GameKind, GameModule<any>][];
}
