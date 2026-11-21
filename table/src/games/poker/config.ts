import { DEFAULT_TURN_SECONDS, MAX_TURN_SECONDS, MIN_TURN_SECONDS } from "./turn.js";

/** Poker's part of the app config, at `games.poker`. */
export type PokerConfig = {
  /** Whether "deal automatically" starts ticked when someone opens a table. */
  autoDealDefault: boolean;
  /** How long each player has to act at a new table. */
  turnSecondsDefault: number;
};

export function readPokerConfig(raw: Record<string, unknown> | null): PokerConfig {
  const auto = raw?.autoDealDefault;
  const seconds = raw?.turnSecondsDefault;
  return {
    autoDealDefault: typeof auto === "boolean" ? auto : true,
    turnSecondsDefault: typeof seconds === "number" && Number.isFinite(seconds)
      ? Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, Math.round(seconds)))
      : DEFAULT_TURN_SECONDS,
  };
}
