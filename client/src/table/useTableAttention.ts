import { useEffect, useRef } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { playSfx } from "@/game/sfx";
import type { TableSnapshot } from "@/game/types";

/** Your phone ticks for this many seconds before your turn runs out. */
const TICK_SECONDS = 5;

/**
 * What every table does from the shared status alone, whatever the game:
 * the screen stays on while a game is under way, and on this phone only a chime sounds
 * when your clocked turn starts, with a soft tick for each of its last five seconds.
 */
export function useTableAttention(state: TableSnapshot | null) {
  const status = state?.status;
  const playing = status?.phase === "playing" && state?.paused !== true;

  useEffect(() => {
    if (!playing) return;
    // A browser can refuse to keep the screen on (no permission, page in the background). The game goes on.
    void activateKeepAwakeAsync("table").catch(() => undefined);
    return () => {
      void Promise.resolve().then(() => deactivateKeepAwake("table")).catch(() => undefined);
    };
  }, [playing]);

  // Time left as the server saw it, so a wrong phone clock does not matter.
  const turnLeftMs =
    status?.turnDeadline != null && state?.serverNow != null ? Math.max(0, status.turnDeadline - state.serverNow) : undefined;
  const youId = state?.you?.id;
  const yourTurn = youId != null && (status?.toAct.includes(youId) ?? false) && turnLeftMs != null;
  // A new deadline is a new turn, even for the same player.
  const yourTurnKey = yourTurn ? String(status?.turnDeadline) : null;
  const lastTurnKey = useRef<string | null>(null);
  useEffect(() => {
    const before = lastTurnKey.current;
    lastTurnKey.current = yourTurnKey;
    if (yourTurnKey != null && yourTurnKey !== before) playSfx("turnChime");
  }, [yourTurnKey]);
  useEffect(() => {
    if (!yourTurn || turnLeftMs == null) return;
    const endsAt = Date.now() + turnLeftMs;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let second = TICK_SECONDS; second >= 1; second -= 1) {
      const wait = endsAt - second * 1000 - Date.now();
      if (wait >= 0) timers.push(setTimeout(() => playSfx("turnTick"), wait));
    }
    return () => timers.forEach(clearTimeout);
  }, [yourTurn, turnLeftMs, state?.serverNow]);
}
