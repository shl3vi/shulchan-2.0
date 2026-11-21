import { hiddenHand } from "../poker/hiddenHand.js";
import { defineGame, type GameModule } from "../types.js";
import { backgammonDebug } from "./debug.js";
import { backgammonEngineAnswers, openingBackgammon } from "./engine.js";
import { backgammonMoves } from "./moves.js";
import { openBody, type BackgammonSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";

export const backgammon: GameModule<BackgammonSettings> = defineGame<BackgammonSettings>({
  seats: { max: SEATS },
  settings(body) {
    const parsed = openBody.safeParse(body);
    if (!parsed.success) return { error: "Invalid request" };
    const problem = hiddenHand.blindsProblem(parsed.data.smallBlind, parsed.data.buyIn);
    if (problem) return { error: problem };
    return { settings: { smallBlind: parsed.data.smallBlind, buyIn: parsed.data.buyIn } };
  },
  async open(base, settings) {
    const table = { ...base, smallBlind: settings.smallBlind, buyIn: settings.buyIn, kind: "backgammon" as const };
    await hiddenHand.open(table, settings.smallBlind);
    return { ...table, backgammon: await openingBackgammon() };
  },
  chooseSeat,
  seat: hiddenHand.seat,
  unseat: hiddenHand.unseat,
  dropDeparted: hiddenHand.dropDeparted,
  async snapshot(table, viewerId, blockedIds) {
    return {
      ...(await hiddenHand.snapshot(table, viewerId, blockedIds)),
      backgammon: table.backgammon,
      backgammonLog: table.backgammonLog ?? [],
    };
  },
  moves: backgammonMoves,
  health: backgammonEngineAnswers,
  debug: backgammonDebug,
});
