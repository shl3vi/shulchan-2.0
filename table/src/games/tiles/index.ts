import type { TableStatus } from "../../view.js";
import { defineGame, type GameModule } from "../types.js";
import { tilesDebug } from "./debug.js";
import { leaveTiles, tilesEngineAnswers } from "./engine.js";
import { tilesMoves } from "./moves.js";
import { openBody, type TilesSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { noteTilesWin, tilesActor, tilesFor, tilesOf, type TilesState } from "./state.js";
import { tilesEngineCode } from "./refusals.js";

export const tiles: GameModule<TilesSettings> = defineGame<TilesSettings>({
  seats: { max: SEATS },
  settings(body) {
    return openBody.safeParse(body).success ? { settings: {} } : { error: "Invalid request" };
  },
  async open() {
    const state: TilesState = { kind: "tiles", play: null, log: [] };
    return state;
  },
  chooseSeat,
  // A newcomer plays from the next game on.
  async seat() {},
  async unseat(table, player) {
    const state = tilesOf(table);
    if (state.play?.phase !== "playing" || !state.play.players.some((entry) => entry.id === player.id)) return;
    const previous = state.play;
    const next = await leaveTiles(previous, player.id);
    noteTilesWin(state, previous, next);
    state.play = next;
  },
  async dropDeparted(table) {
    table.players = table.players.filter((player) => !player.pendingRemoval);
  },
  async view(table, viewerId) {
    const state = tilesOf(table);
    const actor = tilesActor(state.play);
    const status: TableStatus = {
      phase: !state.play ? "waiting" : state.play.phase === "over" ? "over" : "playing",
      toAct: actor ? [actor] : [],
    };
    return { status, game: { kind: "tiles" as const, play: tilesFor(state.play, viewerId), log: state.log } };
  },
  moves: tilesMoves,
  engineCode: tilesEngineCode,
  health: tilesEngineAnswers,
  debug: tilesDebug,
});
