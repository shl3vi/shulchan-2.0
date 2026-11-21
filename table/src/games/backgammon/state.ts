import type { TableRecord } from "../../store.js";

export type Color = "white" | "black";

export type BackgammonWin = {
  whiteName: string;
  blackName: string;
  winner: Color;
  points: number;
};

/** Which player holds each colour. A player who leaves frees their colour; nobody else changes colour. */
export type Colors = { white?: string; black?: string };

/** Backgammon's part of the table record, at `table.game`. */
export type BackgammonState = {
  kind: "backgammon";
  /** The engine's game, as it returned it. */
  board: unknown;
  /** Finished games, newest last, at most 40. */
  log: BackgammonWin[];
  colors: Colors;
};

export function backgammonOf(table: TableRecord): BackgammonState {
  if (table.game.kind !== "backgammon") throw new Error("This table is not backgammon");
  return table.game as BackgammonState;
}

/**
 * The colours as they stand: a stored colour stays with its player while they are seated, and an
 * empty colour goes to the lowest seated player who has none. Everyone else watches.
 */
export function settledColors(table: TableRecord): Colors {
  const state = backgammonOf(table);
  const seated = table.players.filter((player) => !player.pendingRemoval).sort((a, b) => a.seat - b.seat);
  const here = new Set(seated.map((player) => player.id));
  const next: Colors = {};
  if (state.colors.white && here.has(state.colors.white)) next.white = state.colors.white;
  if (state.colors.black && here.has(state.colors.black)) next.black = state.colors.black;
  for (const color of ["white", "black"] as const) {
    if (next[color]) continue;
    const free = seated.find((player) => player.id !== next.white && player.id !== next.black);
    if (free) next[color] = free.id;
  }
  return next;
}

export function colorOf(colors: Colors, playerId: string): Color | null {
  if (colors.white === playerId) return "white";
  if (colors.black === playerId) return "black";
  return null;
}
