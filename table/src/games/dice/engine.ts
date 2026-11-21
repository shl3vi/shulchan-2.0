import { engineAnswers, enginePost } from "../../engines.js";
import type { SeatPlayer } from "../../store.js";
import type { DiceAction } from "./schema.js";
import type { DicePlay } from "./state.js";

const diceUrl = process.env.DICE_ENGINE_URL ?? "http://127.0.0.1:4003";

export function diceEngineAnswers() {
  return engineAnswers(diceUrl);
}

/** A new game for these players, in seat order. */
export function openingDice(players: Pick<SeatPlayer, "id" | "name">[]) {
  return enginePost<DicePlay>(diceUrl, "/games", { players: players.map(({ id, name }) => ({ id, name })) });
}

/** The engine rolls the dice and checks the turn and every box. */
export function playDice(game: DicePlay, playerId: string, action: DiceAction) {
  return enginePost<DicePlay>(diceUrl, "/apply", { game, playerId, action });
}

export function leaveDice(game: DicePlay, playerId: string) {
  return enginePost<DicePlay>(diceUrl, "/leave", { game, playerId });
}
