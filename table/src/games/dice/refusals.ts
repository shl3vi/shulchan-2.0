import { REFUSAL } from "../../errors.js";

/** The dice engine's refusals, by their English text, as the codes the app translates. */
const CODES: Record<string, string> = {
  "Not your turn": REFUSAL.notYourTurn,
  "The game is over": REFUSAL.gameOver,
  "Nobody is seated": REFUSAL.needsTwo,
  "Roll first": "dice.roll-first",
  "No rolls left. Pick a box.": "dice.no-rolls",
  "That box is already used": "dice.box-used",
  "Every die is kept": "dice.all-kept",
  "Invalid request": REFUSAL.invalid,
};

export function diceEngineCode(message: string) {
  return Object.hasOwn(CODES, message) ? CODES[message] : undefined;
}
