import type { TableRecord } from "../../store.js";

/** The engine's game, as far as the table needs to read it. Racks and the pool are secret. */
export type TilesPlay = {
  phase: "playing" | "over";
  turn: number;
  turns: number;
  pool: string[];
  table: string[][];
  players: { id: string; name: string; rack: string[]; melded: boolean; left?: boolean }[];
  last: { playerId: string; kind: "play" | "draw" | "pass"; tiles: number } | null;
  winners: string[];
  points: Record<string, number>;
};

export type TilesWin = { scores: { name: string; points: number }[]; winners: string[] };

/** The tile game's part of the table record, at `table.game`. */
export type TilesState = {
  kind: "tiles";
  /** The engine's game, or null before the first game is started. */
  play: TilesPlay | null;
  /** Finished games, newest last, at most 40. */
  log: TilesWin[];
};

export function tilesOf(table: TableRecord): TilesState {
  if (table.game.kind !== "tiles") throw new Error("This table is not tiles");
  return table.game as TilesState;
}

export function tilesActor(play: TilesPlay | null) {
  if (!play || play.phase !== "playing") return undefined;
  return play.players[play.turn]?.id;
}

/** Records a finished game once, as it ends. */
export function noteTilesWin(state: TilesState, previous: TilesPlay | null, next: TilesPlay) {
  if (next.phase !== "over" || previous?.phase === "over") return;
  const scores = next.players
    .map((player) => ({ name: player.name, points: next.points[player.id] ?? 0 }))
    .sort((a, b) => b.points - a.points);
  const winners = next.players.filter((player) => next.winners.includes(player.id)).map((player) => player.name);
  state.log = [...state.log, { scores, winners }].slice(-40);
}

/**
 * What one viewer sees: their own rack, everyone's tile count, and the table.
 * Every rack is shown once the game is over.
 */
export function tilesFor(play: TilesPlay | null, viewerId?: string) {
  if (!play) return null;
  const over = play.phase === "over";
  return {
    phase: play.phase,
    turn: play.turn,
    turns: play.turns,
    poolCount: play.pool.length,
    table: play.table,
    last: play.last,
    winners: play.winners,
    points: play.points,
    players: play.players.map((player) => ({
      id: player.id,
      name: player.name,
      melded: player.melded,
      left: player.left === true,
      count: player.rack.length,
      ...(over || player.id === viewerId ? { rack: player.rack } : {}),
    })),
  };
}
