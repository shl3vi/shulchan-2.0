import { defineGame, type GameModule } from "../types.js";
import { readPokerConfig } from "./config.js";
import { pokerDeadline, pokerOnDeadline, pokerResume } from "./deadline.js";
import { pokerDebug } from "./debug.js";
import { dropRemovedPlayers, foldDeparted } from "./departures.js";
import { openHand, pokerEngineAnswers, readPoker, seatPoker, unseatPoker } from "./engine.js";
import { pokerMoves } from "./moves.js";
import { readOpenSettings, type PokerSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { pokerOf, type PokerState } from "./state.js";
import { pokerView } from "./view.js";

export const poker: GameModule<PokerSettings> = defineGame<PokerSettings>({
  seats: { max: SEATS },
  settings: readOpenSettings,
  async open(settings) {
    const state: PokerState = {
      kind: "poker",
      smallBlind: settings.smallBlind,
      buyIn: settings.buyIn,
      bought: {},
      ...(settings.autoDeal ? { autoDeal: true } : {}),
      ...(settings.turnSeconds != null ? { turnSeconds: settings.turnSeconds } : {}),
    };
    await openHand(state, settings.smallBlind);
    return state;
  },
  chooseSeat,
  async seat(table, player) {
    const state = pokerOf(table);
    await seatPoker(table, player.seat, state.buyIn);
    state.bought[player.id] = state.buyIn;
  },
  async unseat(table, player) {
    await unseatPoker(table, player.seat);
  },
  async dropDeparted(table) {
    await dropRemovedPlayers(table);
    await foldDeparted(table);
    await dropRemovedPlayers(table);
  },
  async view(table, viewerId) {
    return pokerView(table, await readPoker(table), viewerId);
  },
  moves: pokerMoves,
  deadline: pokerDeadline,
  onDeadline: pokerOnDeadline,
  resume: pokerResume,
  config: readPokerConfig,
  health: pokerEngineAnswers,
  debug: pokerDebug,
});
