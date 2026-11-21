/** Seat numbers 0 to size - 1 that nobody holds. */
export function freeSeats(size: number, taken: number[]) {
  const used = new Set(taken);
  return Array.from({ length: size }, (_, index) => index).filter((index) => !used.has(index));
}

/** Free chair farthest round the table from anyone this player has blocked, or who has blocked them. */
export function farthestSeat(size: number, taken: number[], avoid: number[]): number | undefined {
  const free = freeSeats(size, taken);
  if (free.length === 0) return undefined;
  if (avoid.length === 0) return free[0];
  let best = free[0] ?? 0;
  let bestDistance = -1;
  for (const seat of free) {
    const distance = Math.min(...avoid.map((other) => {
      const gap = Math.abs(seat - other);
      return Math.min(gap, size - gap);
    }));
    if (distance > bestDistance) {
      bestDistance = distance;
      best = seat;
    }
  }
  return best;
}
