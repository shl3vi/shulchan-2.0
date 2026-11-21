import type { TableSnapshot } from "@/game/types";

export type TilesPlayerView = {
  id: string;
  name: string;
  melded: boolean;
  left: boolean;
  count: number;
  /** Only your own rack, and everyone's once the game is over. */
  rack?: string[];
};

export type TilesPlayView = {
  phase: "playing" | "over";
  turn: number;
  turns: number;
  poolCount: number;
  table: string[][];
  last: { playerId: string; kind: "play" | "draw" | "pass"; tiles: number } | null;
  winners: string[];
  points: Record<string, number>;
  players: TilesPlayerView[];
};

/** The tile game's part of the snapshot, at `state.game`. */
export type TilesView = {
  kind: "tiles";
  play: TilesPlayView | null;
  log: { scores: { name: string; points: number }[]; winners: string[] }[];
};

export function tilesView(state: TableSnapshot | null): TilesView | null {
  return state?.game.kind === "tiles" ? (state.game as TilesView) : null;
}
