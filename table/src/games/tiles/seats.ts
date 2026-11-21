import { farthestSeat } from "../../seats.js";

/** Seats at the table. The first four seated play each game; anyone else watches. */
export const SEATS = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** The lowest free seat, or, for someone blocked by a seated player, the one farthest from them. */
export function chooseSeat(taken: number[], avoid: number[]): number | undefined {
  return farthestSeat(SEATS, taken, avoid);
}
