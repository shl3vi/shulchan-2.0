import type { GameEntry } from "@/games/types";
import { DiceScreen } from "./DiceScreen";
import { OpenDiceTable } from "./OpenDiceTable";

export const dice: GameEntry = {
  Screen: DiceScreen,
  lobby: { icon: "cube", iconSize: 30, title: "diceTable" },
  OpenOptions: OpenDiceTable,
};
