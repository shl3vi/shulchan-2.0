import type { TableSnapshot } from "@/game/types";
import type { Color } from "@/games/backgammon/rules";

/** Backgammon's part of the snapshot, at `state.game`. */
export type BackgammonView = {
  kind: "backgammon";
  /** The engine's game. The screen reads it as a `Game`. */
  board: unknown;
  log: { whiteName: string; blackName: string; winner: Color; points: number }[];
  /** Which player holds each colour. A player keeps their colour when the other leaves. */
  colors: { white: string | null; black: string | null };
};

export function backgammonView(state: TableSnapshot | null): BackgammonView | null {
  return state?.game.kind === "backgammon" ? (state.game as BackgammonView) : null;
}
