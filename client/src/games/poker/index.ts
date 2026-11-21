import type { GameEntry } from "@/games/types";
import { OpenPokerTable } from "./OpenPokerTable";
import { PokerScreen } from "./PokerScreen";

export const poker: GameEntry = {
  Screen: PokerScreen,
  lobby: { icon: "diamond", iconSize: 29, title: "pokerTable" },
  OpenOptions: OpenPokerTable,
};
