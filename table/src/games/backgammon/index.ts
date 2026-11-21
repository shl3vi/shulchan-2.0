import { sharedView } from "../../view.js";
import { defineGame, type GameModule } from "../types.js";
import { backgammonDebug } from "./debug.js";
import { backgammonEngineAnswers, openingBackgammon } from "./engine.js";
import { backgammonMoves } from "./moves.js";
import { openBody, type BackgammonSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { backgammonOf, settledColors, type BackgammonState } from "./state.js";

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
  async snapshot(table, viewerId, blockedIds) {
    const shared = sharedView(table, viewerId, blockedIds);
    const state = backgammonOf(table);
    const colors = settledColors(table);
    // The poker-shaped fields stay, empty, until the app reads the new snapshot.
    return {
      ...shared,
      status: "waiting" as const,
      smallBlind: 0,
      bigBlind: 0,
      buyIn: 0,
      communityCards: [],
      pots: [],
      round: null,
      playerToActId: null,
      players: shared.players.map((player) => ({ ...player, stack: 0, betSize: 0, inHand: false, sittingOut: false, bought: 0 })),
      you: shared.you ? { ...shared.you, holeCards: [], legalActions: [], chipRange: null } : null,
      shownCards: [],
      lastWinners: [],
      backgammon: state.board,
      backgammonLog: state.log,
      backgammonColors: { white: colors.white ?? null, black: colors.black ?? null },
    };
  },
  moves: backgammonMoves,
  health: backgammonEngineAnswers,
  debug: backgammonDebug,
});
