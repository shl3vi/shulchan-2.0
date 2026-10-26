export type TableKind = "poker" | "backgammon";

export type PokerRound = "preflop" | "flop" | "turn" | "river" | null;

export type Tally = {
  kind: TableKind;
  createdAt: number;
  peakPlayers: number;
  players: number;
  games: number;
  rounds: number;
  joinRefusals: number;
  errors: number;
  videoUsed: boolean;
  pokerRound: PokerRound;
};

const STREETS: PokerRound[] = ["preflop", "flop", "turn", "river"];

export function freshTally(kind: TableKind, now: number): Tally {
  return {
    kind,
    createdAt: now,
    peakPlayers: 0,
    players: 0,
    games: 0,
    rounds: 0,
    joinRefusals: 0,
    errors: 0,
    videoUsed: false,
    pokerRound: null,
  };
}

export function applyPlayers(tally: Tally, count: number) {
  tally.peakPlayers = Math.max(tally.peakPlayers, count);
  const closed = tally.players > 0 && count === 0;
  tally.players = count;
  return closed;
}

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

export function applyBackgammon(
  tally: Tally,
  previous: { phase?: unknown; turn?: unknown } | null,
  next: { phase?: unknown; turn?: unknown },
  gamesGained: number,
) {
  if (gamesGained > 0) tally.games += gamesGained;
  if (typeof next.turn === "string" && next.turn !== previous?.turn && next.phase === "roll") tally.rounds += 1;
}
