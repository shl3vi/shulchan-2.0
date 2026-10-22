/** Opening position. The client owns the rules; the server only stores and shares this object. */
export function openingBackgammon() {
  const points = Array.from({ length: 24 }, () => 0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turn: "white",
    phase: "opening",
    dice: [] as number[],
    shown: [] as number[],
    cube: 1,
    cubeOwner: "center",
    winner: null,
    score: 0,
    message: "roll",
  };
}

function color(value: unknown) {
  return value === "white" || value === "black";
}

function ints(value: unknown, max: number) {
  return Array.isArray(value) && value.length <= max && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
}

/** Rejects anything that is not a board the client can draw. Rules are not re-checked here. */
export function readBackgammon(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const game = body as Record<string, unknown>;
  const points = game.points;
  const bar = game.bar as Record<string, unknown> | undefined;
  const off = game.off as Record<string, unknown> | undefined;
  const phases = new Set(["opening", "roll", "move", "offer", "over"]);
  if (!Array.isArray(points) || points.length !== 24 || points.some((value) => !Number.isInteger(value) || value < -15 || value > 15)) return null;
  if (!bar || !off) return null;
  if (![bar.white, bar.black, off.white, off.black].every((value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 15)) return null;
  if (!color(game.turn)) return null;
  if (typeof game.phase !== "string" || !phases.has(game.phase)) return null;
  if (!ints(game.dice, 4) || !ints(game.shown, 2)) return null;
  if (!Number.isInteger(game.cube) || (game.cube as number) < 1 || (game.cube as number) > 64) return null;
  if (game.cubeOwner !== "center" && !color(game.cubeOwner)) return null;
  if (game.winner != null && !color(game.winner)) return null;
  if (!Number.isInteger(game.score) || (game.score as number) < 0) return null;
  if (typeof game.message !== "string" || game.message.length > 40) return null;
  return game;
}
