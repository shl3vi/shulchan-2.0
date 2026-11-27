import type { TableStatus } from "../../view.js";
import { defineGame, type GameModule } from "../types.js";
import { diceDebug } from "./debug.js";
import { diceEngineAnswers, leaveDice } from "./engine.js";
import { diceMoves } from "./moves.js";
import { openBody, type DiceSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { diceActor, diceOf, noteDiceWin, type DiceState } from "./state.js";
import { diceEngineCode } from "./refusals.js";

export const dice: GameModule<DiceSettings> = defineGame<DiceSettings>({
  seats: { max: SEATS },
  settings(body) {
    return openBody.safeParse(body).success ? { settings: {} } : { error: "Invalid request" };
  },
  async open() {
    const state: DiceState = { kind: "dice", play: null, log: [] };
    return state;
  },
  chooseSeat,
  // A newcomer plays from the next game on.
  async seat() {},
  async unseat(table, player) {
    const state = diceOf(table);
    if (state.play?.phase !== "playing" || !state.play.players.some((entry) => entry.id === player.id)) return;
    const previous = state.play;
    const next = await leaveDice(previous, player.id);
    noteDiceWin(state, previous, next);
    state.play = next;
  },
  async dropDeparted(table) {
    table.players = table.players.filter((player) => !player.pendingRemoval);
  },
  async view(table) {
    const state = diceOf(table);
    const actor = diceActor(state.play);
    const status: TableStatus = {
      phase: !state.play ? "waiting" : state.play.phase === "over" ? "over" : "playing",
      toAct: actor ? [actor] : [],
    };
    return { status, game: { kind: "dice" as const, play: state.play, log: state.log } };
  },
  moves: diceMoves,
  engineCode: diceEngineCode,
  health: diceEngineAnswers,
  debug: diceDebug,
});
