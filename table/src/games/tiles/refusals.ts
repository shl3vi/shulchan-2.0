import { REFUSAL } from "../../errors.js";

/** The tiles engine's refusals, by their English text, as the codes the app translates. */
const CODES: Record<string, string> = {
  "Not your turn": REFUSAL.notYourTurn,
  "The game is over": REFUSAL.gameOver,
  "Tiles needs two players": REFUSAL.needsTwo,
  "Tiles on the table stay on the table": "tiles.table-tiles-stay",
  "That tile is not on your rack": "tiles.not-on-rack",
  "Play at least one tile from your rack, or draw": "tiles.play-or-draw",
  "Every set needs 3 or more tiles in a group or a run": "tiles.bad-set",
  "Invalid request": REFUSAL.invalid,
};

export function tilesEngineCode(message: string) {
  return Object.hasOwn(CODES, message) ? CODES[message] : undefined;
}
