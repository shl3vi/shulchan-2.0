import type { TableSnapshot } from "@/game/types";
import type { DiceGame } from "@/games/dice/scoring";

/** The dice game's part of the snapshot, at `state.game`. */
export type DiceView = {
  kind: "dice";
  /** The game, or null before anyone has started one. */
  play: DiceGame | null;
  /** Finished games, newest last. */
  log: { scores: { name: string; total: number }[]; winners: string[] }[];
};

export function diceView(state: TableSnapshot | null): DiceView | null {
  return state?.game.kind === "dice" ? (state.game as DiceView) : null;
}
