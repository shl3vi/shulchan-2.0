import type { TableSnapshot } from "@/game/types";
import { useRemoteConfig } from "@/game/UpdateNotice";

export function useTableAdAllowed(state: TableSnapshot | null) {
  const config = useRemoteConfig();
  return config.ads.mode !== "off" && state?.round == null;
}
