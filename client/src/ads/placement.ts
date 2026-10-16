import type { TableSnapshot } from "@/game/types";

export const adsEnabled = process.env.EXPO_PUBLIC_ADS_ENABLED !== "false";

// Ads never appear during a hand: not on your turn, not over a seat, not while cards are live.
export function tableAdAllowed(state: TableSnapshot | null) {
  return adsEnabled && state?.round == null;
}
