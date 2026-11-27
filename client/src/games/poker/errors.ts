import type { MessageKey } from "@/i18n";

/** The poker table's own refusal codes, as the server sends them, and their words. */
export const POKER_ERRORS: Record<string, MessageKey> = {
  "poker.bet-range": "errPokerBetRange",
  "poker.need-two-with-chips": "needTwoWithMoney",
  "poker.illegal": "errPokerIllegal",
  "poker.hand-running": "errPokerHandRunning",
  "poker.buy-in-low": "errPokerBuyInLow",
  "poker.rebuy-amount": "errPokerRebuyAmount",
  "poker.rebuys-off": "errPokerRebuysOff",
  "poker.rebuy-not-yet": "errPokerRebuyNotYet",
};
