import type { MessageKey } from "@/i18n";

/** The backgammon table's own refusal codes, as the server sends them, and their words. */
export const BACKGAMMON_ERRORS: Record<string, MessageKey> = {
  "backgammon.bad-move": "errBgBadMove",
  "backgammon.no-roll": "errBgNoRoll",
  "backgammon.no-double": "errBgNoDouble",
  "backgammon.not-cube-owner": "errBgNotCubeOwner",
  "backgammon.cube-limit": "errBgCubeLimit",
  "backgammon.no-offer": "errBgNoOffer",
};
