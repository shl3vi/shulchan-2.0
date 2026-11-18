import type { ActionName, EngineView } from "./engine.js";

/** How long a poker player has to act when the table sets nothing else. */
export const DEFAULT_TURN_SECONDS = 30;
export const TURN_MS = DEFAULT_TURN_SECONDS * 1000;
/** The admin can set any whole number of seconds in this range. */
export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 300;

export type TurnClock = {
  seat: number;
  round: NonNullable<EngineView["round"]>;
  /** Server epoch ms. */
  deadline: number;
};

type TurnTable = { turn?: TurnClock; turnSeconds?: number };

/** The table's turn length. Tables opened before it could be set get the old 30 seconds. */
export function turnMs(table: TurnTable) {
  return (table.turnSeconds ?? DEFAULT_TURN_SECONDS) * 1000;
}

/**
 * Starts a full clock whenever a new seat is to act. `fresh` is set after a real
 * action or a new hand, so the same seat acting again later still gets a full clock.
 * Seating, rebuys and leaves keep the running clock instead of resetting it.
 */
export function stampTurn(table: TurnTable, view: EngineView, now: number, fresh: boolean) {
  const seat = view.playerToActSeat;
  if (seat == null || view.round == null) {
    delete table.turn;
    return;
  }
  const current = table.turn;
  if (!fresh && current && current.seat === seat && current.round === view.round) return;
  table.turn = { seat, round: view.round, deadline: now + turnMs(table) };
}

/** After a pause, or a new turn length, the player to act gets a full clock again. */
export function restartTurn(table: TurnTable, now: number) {
  if (table.turn) table.turn.deadline = now + turnMs(table);
}

/** A player who ran out of time checks when that costs nothing, otherwise folds. */
export function timeoutAction(legal: ActionName[]): ActionName | null {
  if (legal.includes("check")) return "check";
  if (legal.includes("fold")) return "fold";
  return null;
}

/** The clock has run out for the seat that is still to act. */
export function turnExpired(table: TurnTable, view: EngineView, now: number) {
  const turn = table.turn;
  if (!turn || now < turn.deadline) return false;
  return view.playerToActSeat === turn.seat && view.round === turn.round;
}
