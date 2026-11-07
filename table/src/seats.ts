const SEATS = 9;

/** Free chair farthest from anyone this player has blocked, or who has blocked them. */
export function chooseSeat(taken: number[], avoid: number[], kind: "poker" | "backgammon"): number | undefined {
  const used = new Set(taken);
  const free = Array.from({ length: SEATS }, (_, index) => index).filter((index) => !used.has(index));
  if (free.length === 0) return undefined;
  if (avoid.length === 0) return free[0];
  if (kind === "backgammon") {
    const seated = [...taken].sort((a, b) => a - b);
    const playing = seated.slice(0, 2);
    const blockedAtTable = playing.some((seat) => avoid.includes(seat));
    if (blockedAtTable && seated.length >= 2) {
      const above = free.filter((seat) => seat > (playing[1] ?? playing[0] ?? -1));
      if (above.length > 0) return above[above.length - 1];
    }
    return free[0];
  }
  let best = free[0] ?? 0;
  let bestDistance = -1;
  for (const seat of free) {
    const distance = Math.min(...avoid.map((other) => {
      const gap = Math.abs(seat - other);
      return Math.min(gap, SEATS - gap);
    }));
    if (distance > bestDistance) {
      bestDistance = distance;
      best = seat;
    }
  }
  return best;
}
