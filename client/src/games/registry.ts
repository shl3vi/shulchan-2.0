import { backgammon } from "@/games/backgammon";
import { dice } from "@/games/dice";
import { poker } from "@/games/poker";
import type { GameEntry } from "@/games/types";

/** The list of games, in the order the lobby shows them. Adding or removing a game is one line here. */
export const games = { backgammon, poker, dice } satisfies Record<string, GameEntry>;

export type GameKind = keyof typeof games;

/** A table from before tables had a kind. */
const DEFAULT_KIND: GameKind = "poker";

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && Object.hasOwn(games, value);
}

export function kindOf(kind: unknown): GameKind {
  return isGameKind(kind) ? kind : DEFAULT_KIND;
}

export function gameList() {
  return Object.entries(games) as [GameKind, GameEntry][];
}
