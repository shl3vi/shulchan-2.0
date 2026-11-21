import { defineGame, type GameModule } from "../types.js";
import { considerAutoDeal } from "./autodeal.js";
import { pokerDebug } from "./debug.js";
import { dropRemovedPlayers, foldDeparted } from "./departures.js";
import { createPokerTable, pokerEngineAnswers, readPoker, seatPoker, unseatPoker } from "./engine.js";
import { pokerMoves } from "./moves.js";
import { readOpenSettings, type PokerSettings } from "./schema.js";
import { chooseSeat, SEATS } from "./seats.js";
import { snapshot } from "./snapshot.js";
import { restartTurn } from "./turn.js";
import { armTurn, expireTurn, overdueTurn } from "./turnWatch.js";

export const poker: GameModule<PokerSettings> = defineGame<PokerSettings>({
  seats: { max: SEATS },
  settings: readOpenSettings,
  async open(base, settings) {
    const table = {
      ...base,
      smallBlind: settings.smallBlind,
      buyIn: settings.buyIn,
      kind: "poker" as const,
      ...(settings.autoDeal ? { autoDeal: true } : {}),
      ...(settings.turnSeconds != null ? { turnSeconds: settings.turnSeconds } : {}),
    };
    await createPokerTable(table, settings.smallBlind);
    return table;
  },
  chooseSeat,
  async seat(table, player) {
    player.bought = table.buyIn;
    await seatPoker(table, player.seat, table.buyIn);
  },
  async unseat(table, player) {
    await unseatPoker(table, player.seat);
  },
  async dropDeparted(table) {
    await dropRemovedPlayers(table);
    await foldDeparted(table);
    await dropRemovedPlayers(table);
  },
  async snapshot(table, viewerId, blockedIds) {
    return snapshot(table, await readPoker(table), viewerId, blockedIds);
  },
  moves: pokerMoves,
  changed(tableId) {
    void considerAutoDeal(tableId);
  },
  arm: armTurn,
  async sweep(table, now) {
    if (overdueTurn(table, now)) await expireTurn(table.id);
  },
  resume(table, now) {
    restartTurn(table, now);
  },
  health: pokerEngineAnswers,
  debug: pokerDebug,
});
