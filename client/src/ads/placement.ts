import { Platform } from "react-native";
import type { TableSnapshot } from "@/game/types";
import { useRemoteConfig } from "@/game/UpdateNotice";

export function useTableAdAllowed(state: TableSnapshot | null) {
  const config = useRemoteConfig();
  // AdMob has no web banner, so the browser keeps no empty ad slot. The get-the-app strip sits there instead.
  return Platform.OS !== "web" && config.ads.mode !== "off" && state?.round == null;
}
