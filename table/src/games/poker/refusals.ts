import { REFUSAL } from "../../errors.js";

/** The poker engine's refusals, by their English text, as the codes the app translates. */
const CODES: Record<string, string> = {
  "Not your turn": REFUSAL.notYourTurn,
  "No action is open": REFUSAL.notYourTurn,
  "Illegal action": "poker.illegal",
  "Bet size is outside the allowed range": "poker.bet-range",
  "Hand already in progress": "poker.hand-running",
  "At least two players need chips to deal.": "poker.need-two-with-chips",
  "Invalid request": REFUSAL.invalid,
};

export function pokerEngineCode(message: string) {
  return Object.hasOwn(CODES, message) ? CODES[message] : undefined;
}
