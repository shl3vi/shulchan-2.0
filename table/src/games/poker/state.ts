import type { TableRecord } from "../../store.js";
import type { EngineView } from "./engine.js";
import type { TurnClock } from "./turn.js";

export type RebuyRule = "any" | "busted" | "off";

/** Poker's part of the table record, at `table.game`. */
export type PokerState = {
  kind: "poker";
  smallBlind: number;
  buyIn: number;
  /** The engine's hand, as it returned it. Only the engine reads inside. */
  hand?: unknown;
  /** The engine's last view of that hand. */
  view?: EngineView;
  /** The next hand starts on its own once the table is waiting. */
  autoDeal?: boolean;
  /** Who may buy more chips: anyone at any time (the default), only a player with none left, or nobody. */
  rebuy?: RebuyRule;
  /** Seconds each player has to act. Set from the region's config, changed by the admin. */
  turnSeconds?: number;
  /** The seat to act and when the server acts for them. */
  turn?: TurnClock;
  /** Server epoch ms when the next hand may start on its own. Set while the table waits between hands. */
  autoDealAt?: number;
  /** Chips each player has bought in all, by player id. */
  bought: Record<string, number>;
};

/** How long the winners stay on screen before an automatic deal. */
export const AUTO_DEAL_DELAY_MS = 5_000;

export function pokerOf(table: TableRecord): PokerState {
  if (table.game.kind !== "poker") throw new Error("This table is not poker");
  return table.game as PokerState;
}
