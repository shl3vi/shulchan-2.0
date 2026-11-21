export type PublicPlayer = {
  id: string;
  name: string;
  seat: number;
  blocked?: boolean;
  /** Playing in the browser. The server never makes a browser player admin. */
  web?: boolean;
};

/** Where the table's game stands, in terms every screen understands without knowing the game. */
export type TableStatus = {
  phase: "waiting" | "playing" | "over";
  /** Player ids whose move it is. */
  toAct: string[];
  /** Server epoch ms when the server moves for them. Absent when nobody is on a clock. */
  turnDeadline?: number;
};

export type TableSnapshot = {
  id: string;
  players: PublicPlayer[];
  you: { id: string; isAdmin: boolean } | null;
  password?: string;
  paused?: boolean;
  idleCloseAt?: number;
  serverNow?: number;
  status: TableStatus;
  /** The game's own part. Each game's folder reads it with its own type. */
  game: { kind: string };
};

export type Credentials = {
  gameId: string;
  playerId: string;
  playerSecret: string;
};
