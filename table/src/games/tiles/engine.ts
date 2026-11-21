import { engineAnswers, enginePost } from "../../engines.js";
import type { SeatPlayer } from "../../store.js";
import type { TilesAction } from "./schema.js";
import type { TilesPlay } from "./state.js";

const tilesUrl = process.env.TILES_ENGINE_URL ?? "http://127.0.0.1:4004";

export function tilesEngineAnswers() {
  return engineAnswers(tilesUrl);
}

/** A new game for these players: the engine shuffles, deals and picks who starts. */
export function openingTiles(players: Pick<SeatPlayer, "id" | "name">[]) {
  return enginePost<TilesPlay>(tilesUrl, "/games", { players: players.map(({ id, name }) => ({ id, name })) });
}

/** The engine checks the turn, every set on the table, and the first 30 points. */
export function playTiles(game: TilesPlay, playerId: string, action: TilesAction) {
  return enginePost<TilesPlay>(tilesUrl, "/apply", { game, playerId, action });
}

export function leaveTiles(game: TilesPlay, playerId: string) {
  return enginePost<TilesPlay>(tilesUrl, "/leave", { game, playerId });
}
