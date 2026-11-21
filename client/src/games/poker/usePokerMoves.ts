import { useGameSession } from "@/game/GameSession";
import type { RebuyRule } from "@/game/types";

/** Poker's moves. Each one is a socket event; the admin-only ones are not sent by anyone else. */
export function usePokerMoves() {
  const { state, emit } = useGameSession();
  const isAdmin = state?.you?.isAdmin === true;
  return {
    startHand() {
      if (!isAdmin) return;
      emit("start-hand");
    },
    setAutoDeal(enabled: boolean) {
      if (!isAdmin) return;
      emit("auto-deal", { enabled });
    },
    setTurnSeconds(seconds: number) {
      if (!isAdmin) return;
      emit("turn-time", { seconds });
    },
    setTableSettings(settings: { smallBlind?: number; buyIn?: number; rebuy?: RebuyRule }) {
      if (!isAdmin) return;
      emit("table-settings", settings);
    },
    act(action: string, amount?: number) {
      emit("act", { action, amount });
    },
    rebuy(amount: number) {
      emit("rebuy", { amount });
    },
  };
}
