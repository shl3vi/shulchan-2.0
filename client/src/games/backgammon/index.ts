import type { GameEntry } from "@/games/types";
import { BackgammonScreen } from "./BackgammonScreen";
import { OpenBackgammonTable } from "./OpenBackgammonTable";

export const backgammon: GameEntry = {
  Screen: BackgammonScreen,
  lobby: { icon: "dice", iconSize: 31, title: "backgammonTable" },
  OpenOptions: OpenBackgammonTable,
};
