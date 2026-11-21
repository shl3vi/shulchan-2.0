import type { ComponentProps, ComponentType } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";
import type { Credentials } from "@/game/types";
import type { MessageKey } from "@/i18n";

/**
 * What every game gives the app. Shared screens reach a game only through this entry,
 * by way of games/registry.ts, and never name a game.
 */
export type GameEntry = {
  /** The whole table screen for this game. The player is already seated. */
  Screen: ComponentType<{ credentials: Credentials }>;
  /** The card in the lobby's "open a table" grid. */
  lobby: { icon: ComponentProps<typeof Ionicons>["name"]; iconSize: number; title: MessageKey };
  /** The game's part of the opening form. Reports the settings to open with, or null while they are not valid. */
  OpenOptions: ComponentType<{ onChange: (settings: object | null) => void }>;
};
