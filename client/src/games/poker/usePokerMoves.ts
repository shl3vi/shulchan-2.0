import { useGameSession } from "@/game/GameSession";
import type { RebuyRule } from "@/games/poker/types";

/** Poker's moves, each sent as a `move` event. The admin-only ones are not sent by anyone else. */
export function usePokerMoves() {
  const { state, emit } = useGameSession();
  const isAdmin = state?.you?.isAdmin === true;
  return {
    startHand() {
      if (!isAdmin) return;
      emit("move", { type: "deal" });
    },
    setAutoDeal(enabled: boolean) {
      if (!isAdmin) return;
      emit("move", { type: "autoDeal", enabled });
    },
    setTurnSeconds(seconds: number) {
      if (!isAdmin) return;
      emit("move", { type: "turnTime", seconds });
    },
    setTableSettings(settings: { smallBlind?: number; buyIn?: number; rebuy?: RebuyRule }) {
      if (!isAdmin) return;
      emit("move", { type: "settings", ...settings });
    },
    act(action: string, amount?: number) {
      emit("move", { type: "act", action, ...(amount != null ? { amount } : {}) });
    },
    rebuy(amount: number) {
      emit("move", { type: "rebuy", amount });
    },
  };
}
