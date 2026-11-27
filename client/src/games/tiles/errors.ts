import type { MessageKey } from "@/i18n";

/** The tiles table's own refusal codes, as the server sends them, and their words. */
export const TILES_ERRORS: Record<string, MessageKey> = {
  "tiles.table-tiles-stay": "errTilesTableStay",
  "tiles.not-on-rack": "errTilesNotOnRack",
  "tiles.play-or-draw": "errTilesPlayOrDraw",
  "tiles.bad-set": "errTilesBadSet",
};
