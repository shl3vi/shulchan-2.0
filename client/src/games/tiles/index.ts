import type { GameEntry } from "@/games/types";
import { OpenTilesTable } from "./OpenTilesTable";
import { TilesScreen } from "./TilesScreen";

export const tiles: GameEntry = {
  Screen: TilesScreen,
  lobby: { icon: "apps", iconSize: 28, title: "tilesTable" },
  OpenOptions: OpenTilesTable,
};
