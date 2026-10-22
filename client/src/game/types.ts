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
};

export type TableSnapshot = {
  id: string;
  status: "waiting" | "playing";
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  kind?: "poker" | "backgammon";
  backgammon?: unknown;
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
};

export type Credentials = {
  gameId: string;
  playerId: string;
  playerSecret: string;
};
