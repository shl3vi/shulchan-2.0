import { changeTally } from "../../events/ledger.js";
import type { Tally } from "../../events/tally.js";

export type PokerRound = "preflop" | "flop" | "turn" | "river" | null;

const STREETS: PokerRound[] = ["preflop", "flop", "turn", "river"];

/** A hand counts once, and each street after the deal counts as a round. */
export function applyPoker(tally: Tally, round: PokerRound) {
  const memory = (tally.game ??= {}) as { round?: PokerRound };
  const previous = memory.round ?? null;
  if (previous == null && round != null) tally.games += 1;
  if (previous != null && round != null) {
    const from = STREETS.indexOf(previous);
    const to = STREETS.indexOf(round);
    if (to > from) tally.rounds += to - from;
  }
  memory.round = round;
}

export function notePoker(id: string, round: PokerRound) {
  return changeTally(id, "poker", (tally) => applyPoker(tally, round));
}
