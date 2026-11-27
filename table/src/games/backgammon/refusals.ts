import { REFUSAL } from "../../errors.js";

/** The backgammon engine's refusals, by their English text, as the codes the app translates. */
const CODES: Record<string, string> = {
  "Not your turn": REFUSAL.notYourTurn,
  "That move is not allowed": "backgammon.bad-move",
  "You cannot roll now": "backgammon.no-roll",
  "You cannot double now": "backgammon.no-double",
  "You do not own the cube": "backgammon.not-cube-owner",
  "The cube is at its limit": "backgammon.cube-limit",
  "No double is offered": "backgammon.no-offer",
  "Invalid request": REFUSAL.invalid,
};

export function backgammonEngineCode(message: string) {
  return Object.hasOwn(CODES, message) ? CODES[message] : undefined;
}
