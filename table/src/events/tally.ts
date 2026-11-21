import type { GameKind } from "../games/index.js";

export type Tally = {
  kind: GameKind;
  createdAt: number;
  peakPlayers: number;
  players: number;
  games: number;
  rounds: number;
  joinRefusals: number;
  errors: number;
  videoUsed: boolean;
  /** The game's own memory between events, such as the betting round poker last saw. */
  game?: Record<string, unknown>;
  /** Seats taken from the app and from a browser. Absent on a ledger written before these were counted. */
  appJoins?: number;
  webJoins?: number;
};

export function freshTally(kind: GameKind, now: number): Tally {
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
    appJoins: 0,
    webJoins: 0,
  };
}

export function applyPlayers(tally: Tally, count: number) {
  tally.peakPlayers = Math.max(tally.peakPlayers, count);
  const closed = tally.players > 0 && count === 0;
  tally.players = count;
  return closed;
}
