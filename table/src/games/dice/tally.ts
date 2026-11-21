import { changeTally } from "../../events/ledger.js";
import type { Tally } from "../../events/tally.js";
import type { DicePlay } from "./state.js";

/** A game is a game started. A round is one player's turn ending, which is a box scored. */
export function applyDice(tally: Tally, previous: DicePlay | null, next: DicePlay, started: boolean) {
  if (started) {
    tally.games += 1;
    return;
  }
  if (!previous) return;
  const scored = (game: DicePlay) => game.players.reduce((count, player) => count + Object.keys((player as { scores?: object }).scores ?? {}).length, 0);
  tally.rounds += Math.max(0, scored(next) - scored(previous));
}

export function noteDice(id: string, previous: DicePlay | null, next: DicePlay, started: boolean) {
  return changeTally(id, "dice", (tally) => applyDice(tally, previous, next, started));
}
