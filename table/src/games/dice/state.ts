import type { TableRecord } from "../../store.js";

/** The engine's game, as far as the table needs to read it. */
export type DicePlay = {
  phase: "playing" | "over";
  turn: number;
  rolls: number;
  players: { id: string; name: string; left?: boolean; total?: number }[];
  winners: string[];
};

export type DiceWin = {
  /** Everyone who played, with their final total, best first. */
  scores: { name: string; total: number }[];
  winners: string[];
};

/** The dice game's part of the table record, at `table.game`. */
export type DiceState = {
  kind: "dice";
  /** The engine's game, or null before the first game is started. */
  play: DicePlay | null;
  /** Finished games, newest last, at most 40. */
  log: DiceWin[];
};

export function diceOf(table: TableRecord): DiceState {
  if (table.game.kind !== "dice") throw new Error("This table is not dice");
  return table.game as DiceState;
}

/** The player whose turn it is, or undefined when no game is under way. */
export function diceActor(play: DicePlay | null) {
  if (!play || play.phase !== "playing") return undefined;
  return play.players[play.turn]?.id;
}

/** Records a finished game once, as it ends. */
export function noteDiceWin(state: DiceState, previous: DicePlay | null, next: DicePlay) {
  if (next.phase !== "over" || previous?.phase === "over") return;
  const scores = next.players
    .map((player) => ({ name: player.name, total: player.total ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const winners = next.players.filter((player) => next.winners.includes(player.id)).map((player) => player.name);
  state.log = [...state.log, { scores, winners }].slice(-40);
}
