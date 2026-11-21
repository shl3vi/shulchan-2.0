import type { TableSnapshot } from "@/game/types";

export type Card = { rank: string; suit: string };
export type RebuyRule = "any" | "busted" | "off";
export type PokerAction = "fold" | "check" | "call" | "bet" | "raise";

/** Poker's part of the snapshot, at `state.game`. */
export type PokerView = {
  kind: "poker";
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  /** New small blind that starts with the next hand. */
  nextSmallBlind?: number;
  autoDeal: boolean;
  /** Seconds each player has to act. */
  turnSeconds: number;
  /** Who may buy more chips: anyone, only a player with no chips left, or nobody. */
  rebuy: RebuyRule;
  round: "preflop" | "flop" | "turn" | "river" | null;
  communityCards: Card[];
  pots: { size: number; eligiblePlayers: number[] }[];
  /** Each seated player's chips, by player id. */
  seats: Record<string, { stack: number; betSize: number; inHand: boolean; bought: number }>;
  /** This phone's cards, and its choices when it is this player's turn. */
  hand: { holeCards: Card[]; legalActions: PokerAction[]; chipRange: { min: number; max: number } | null } | null;
  shownCards: { seat: number; cards: Card[] }[];
  lastWinners: { seat: number; name: string; amount: number }[];
};

export function pokerView(state: TableSnapshot | null): PokerView | null {
  return state?.game.kind === "poker" ? (state.game as PokerView) : null;
}

/** The app config's poker section, with defaults for anything missing. */
export function pokerConfig(section: Record<string, unknown> | undefined) {
  const auto = section?.autoDealDefault;
  const seconds = section?.turnSecondsDefault;
  return {
    autoDealDefault: typeof auto === "boolean" ? auto : true,
    turnSecondsDefault: typeof seconds === "number" && Number.isFinite(seconds) ? Math.min(300, Math.max(10, Math.round(seconds))) : 30,
  };
}
