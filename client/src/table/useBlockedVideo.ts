import { useEffect, useEffectEvent } from "react";

/** Keeps video off for every seat this phone has blocked, or that has blocked it. */
export function useBlockedVideo(holdOff: (ids: string[]) => void, players: { id: string; blocked?: boolean }[] | undefined) {
  const blockedKey = (players ?? []).filter((player) => player.blocked).map((player) => player.id).join(" ");
  const apply = useEffectEvent((ids: string[]) => holdOff(ids));
  useEffect(() => {
    apply(blockedKey ? blockedKey.split(" ") : []);
  }, [blockedKey]);
}
