export type Card = { rank: string; suit: string };

export type PublicPlayer = {
  id: string;
  name: string;
  seat: number;
  stack: number;
  betSize: number;
  inHand: boolean;
  sittingOut: boolean;
  bought: number;
  blocked?: boolean;
};

export type RebuyRule = "any" | "busted" | "off";

export type TableSnapshot = {
  id: string;
  status: "waiting" | "playing";
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  kind?: "poker" | "backgammon";
  autoDeal?: boolean;
  /** Poker only. Seconds each player has to act. */
  turnSeconds?: number;
  /** Poker only. New small blind that starts with the next hand. */
  nextSmallBlind?: number;
  /** Poker only. Who may buy more chips: anyone, only a player with no chips left, or nobody. */
  rebuy?: RebuyRule;
  backgammon?: unknown;
  backgammonLog?: { whiteName: string; blackName: string; winner: "white" | "black"; points: number }[];
  communityCards: Card[];
  pots: { size: number; eligiblePlayers: number[] }[];
  round: "preflop" | "flop" | "turn" | "river" | null;
  playerToActId: string | null;
  players: PublicPlayer[];
  you: {
    id: string;
    holeCards: Card[];
    legalActions: Array<"fold" | "check" | "call" | "bet" | "raise">;
    chipRange: { min: number; max: number } | null;
    isAdmin: boolean;
  } | null;
  lastWinners: { seat: number; name: string; amount: number }[];
  shownCards: { seat: number; cards: Card[] }[];
  password?: string;
  paused?: boolean;
  idleCloseAt?: number;
  /** Server epoch ms when the player to act runs out of time. */
  turnDeadline?: number;
  serverNow?: number;
};

export type Credentials = {
  gameId: string;
  playerId: string;
  playerSecret: string;
};
