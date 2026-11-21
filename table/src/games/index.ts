import { backgammon } from "./backgammon/index.js";
import { dice } from "./dice/index.js";
import { poker } from "./poker/index.js";
import { tiles } from "./tiles/index.js";
import type { GameModule } from "./types.js";

/** The list of games. Adding or removing a game is one line here. */
export const games = { poker, backgammon, dice, tiles } satisfies Record<string, GameModule<any>>;

export type GameKind = keyof typeof games;

/** The game a request gets when it names none: the first in the list. */
const DEFAULT_KIND = Object.keys(games)[0] as GameKind;

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && Object.hasOwn(games, value);
}

export function kindOf(table: { game: { kind: string } }): GameKind {
  return isGameKind(table.game.kind) ? table.game.kind : DEFAULT_KIND;
}

export function gameFor(kind: GameKind): GameModule<any> {
  return games[kind];
}

export function gameOf(table: { game: { kind: string } }): GameModule<any> {
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
