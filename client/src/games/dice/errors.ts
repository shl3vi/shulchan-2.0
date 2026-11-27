import type { MessageKey } from "@/i18n";

/** The dice table's own refusal codes, as the server sends them, and their words. */
export const DICE_ERRORS: Record<string, MessageKey> = {
  "dice.roll-first": "errDiceRollFirst",
  "dice.no-rolls": "errDiceNoRolls",
  "dice.box-used": "errDiceBoxUsed",
  "dice.all-kept": "errDiceAllKept",
};
