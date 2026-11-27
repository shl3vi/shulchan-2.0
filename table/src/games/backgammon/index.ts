import type { TableStatus } from "../../view.js";
import { defineGame, type GameModule } from "../types.js";
import { backgammonDebug } from "./debug.js";
import { backgammonEngineAnswers, openingBackgammon } from "./engine.js";
import { backgammonMoves } from "./moves.js";
import { openBody, type BackgammonSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { backgammonOf, settledColors, type BackgammonState } from "./state.js";
import { backgammonEngineCode } from "./refusals.js";

export const backgammon: GameModule<BackgammonSettings> = defineGame<BackgammonSettings>({
  seats: { max: SEATS },
  settings(body) {
    return openBody.safeParse(body).success ? { settings: {} } : { error: "Invalid request" };
  },
  async open() {
    const state: BackgammonState = { kind: "backgammon", board: await openingBackgammon(), log: [], colors: {} };
    return state;
  },
  chooseSeat,
  async seat() {},
  // A leaving player's colour is freed the next time colours are settled.
  async unseat() {},
  async dropDeparted(table) {
    table.players = table.players.filter((player) => !player.pendingRemoval);
  },
  async view(table) {
    const state = backgammonOf(table);
    const colors = settledColors(table);
    const board = state.board as { phase?: string; turn?: "white" | "black" } | undefined;
    const bothSeated = colors.white != null && colors.black != null;
    const over = board?.phase === "over";
    // During a double offer the other player answers.
    const actorColor = !board || over ? null : board.phase === "offer" ? (board.turn === "white" ? "black" : "white") : board.turn;
    const actor = actorColor && bothSeated ? colors[actorColor] : undefined;
    const status: TableStatus = {
      phase: over ? "over" : bothSeated ? "playing" : "waiting",
      toAct: actor ? [actor] : [],
    };
    return {
      status,
      game: {
        kind: "backgammon" as const,
        board: state.board,
        log: state.log,
        /** Which player holds each colour. A player keeps their colour when the other leaves. */
        colors: { white: colors.white ?? null, black: colors.black ?? null },
      },
    };
  },
  moves: backgammonMoves,
  engineCode: backgammonEngineCode,
  health: backgammonEngineAnswers,
  debug: backgammonDebug,
});
