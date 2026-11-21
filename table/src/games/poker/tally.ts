import { changeTally } from "../../events/ledger.js";
import type { PokerRound, Tally } from "../../events/tally.js";

const STREETS: PokerRound[] = ["preflop", "flop", "turn", "river"];

export function applyPoker(tally: Tally, round: PokerRound) {
  const previous = tally.pokerRound;
  if (previous == null && round != null) tally.games += 1;
  if (previous != null && round != null) {
    const from = STREETS.indexOf(previous);
    const to = STREETS.indexOf(round);
    if (to > from) tally.rounds += to - from;
  }
  tally.pokerRound = round;
}

export function notePoker(id: string, round: PokerRound) {
  return changeTally(id, "poker", (tally) => applyPoker(tally, round));
}
