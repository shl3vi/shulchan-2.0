import { farthestSeat } from "../../seats.js";

export const SEATS = 9;

/** Free chair farthest from anyone this player has blocked, or who has blocked them. */
export function chooseSeat(taken: number[], avoid: number[]) {
  return farthestSeat(SEATS, taken, avoid);
}
