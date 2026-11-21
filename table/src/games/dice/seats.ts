import { farthestSeat, freeSeats } from "../../seats.js";

/** Seats at the table. The first six seated play each game; anyone else watches. */
export const SEATS = 8;
export const MAX_PLAYERS = 6;

/** The lowest free seat, or, for someone blocked by a seated player, the one farthest from them. */
export function chooseSeat(taken: number[], avoid: number[]): number | undefined {
  if (avoid.length > 0) return farthestSeat(SEATS, taken, avoid);
  return freeSeats(SEATS, taken)[0];
}
