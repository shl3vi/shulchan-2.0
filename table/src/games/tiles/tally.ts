import { changeTally } from "../../events/ledger.js";
import type { Tally } from "../../events/tally.js";
import type { TilesPlay } from "./state.js";

/** A game is a game started. A round is one turn taken: a play, a draw or a pass. */
export function applyTiles(tally: Tally, previous: TilesPlay | null, next: TilesPlay, started: boolean) {
  if (started) {
    tally.games += 1;
    return;
  }
  if (previous) tally.rounds += Math.max(0, next.turns - previous.turns);
}

export function noteTiles(id: string, previous: TilesPlay | null, next: TilesPlay, started: boolean) {
  return changeTally(id, "tiles", (tally) => applyTiles(tally, previous, next, started));
}
