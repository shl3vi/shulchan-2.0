import { freeSeats } from "../../seats.js";

export const SEATS = 9;

/**
 * The first two seated play and the rest watch. Someone blocked by a player already
 * playing is sent to the far end, so they watch instead of playing that person.
 */
export function chooseSeat(taken: number[], avoid: number[]): number | undefined {
  const free = freeSeats(SEATS, taken);
  if (free.length === 0) return undefined;
  if (avoid.length === 0) return free[0];
  const seated = [...taken].sort((a, b) => a - b);
  const playing = seated.slice(0, 2);
  const blockedAtTable = playing.some((seat) => avoid.includes(seat));
  if (blockedAtTable && seated.length >= 2) {
    const above = free.filter((seat) => seat > (playing[1] ?? playing[0] ?? -1));
    if (above.length > 0) return above[above.length - 1];
  }
  return free[0];
}
