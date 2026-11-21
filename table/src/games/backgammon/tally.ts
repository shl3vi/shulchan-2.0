import { changeTally } from "../../events/ledger.js";
import type { Tally } from "../../events/tally.js";

type Turn = { phase?: unknown; turn?: unknown };

/** A turn is a change of color back to rolling, and every win logged is a game. */
export function applyBackgammon(tally: Tally, previous: Turn | null, next: Turn, gamesGained: number) {
  if (gamesGained > 0) tally.games += gamesGained;
  if (typeof next.turn === "string" && next.turn !== previous?.turn && next.phase === "roll") tally.rounds += 1;
}

export function noteBackgammon(id: string, previous: Turn | null, next: Turn, gamesGained: number) {
  return changeTally(id, "backgammon", (tally) => applyBackgammon(tally, previous, next, gamesGained));
}
