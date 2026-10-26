import { randomInt } from "node:crypto";

export type Color = "white" | "black";

export type Move = {
  from: number | "bar";
  to: number | "off";
  die: number;
};

export type Phase = "opening" | "roll" | "move" | "offer" | "over";

export type Game = {
  points: number[];
  bar: Record<Color, number>;
  off: Record<Color, number>;
  turn: Color;
  phase: Phase;
  dice: number[];
  shown: number[];
  cube: number;
  cubeOwner: Color | "center";
  winner: Color | null;
  score: number;
  message: string;
  /** Counts every roll, so clients can tell a new roll from a repeat of the same faces. */
  rolls: number;
  lastRoll: number[];
};

export type Action =
  | { type: "roll" }
  | { type: "move"; from: number | "bar"; to: number | "off"; die: number }
  | { type: "double" }
  | { type: "answer"; accept: boolean };

export class IllegalAction extends Error {}

const other: Record<Color, Color> = { white: "black", black: "white" };

function opponent(color: Color) {
  return other[color];
}

function die() {
  return randomInt(1, 7);
}

function put(points: number[], point: number, color: Color, count: number) {
  points[point - 1] = (color === "white" ? 1 : -1) * count;
}

export function newGame(): Game {
  const points = Array.from({ length: 24 }, () => 0);
  put(points, 24, "white", 2);
  put(points, 13, "white", 5);
  put(points, 8, "white", 3);
  put(points, 6, "white", 5);
  put(points, 1, "black", 2);
  put(points, 12, "black", 5);
  put(points, 17, "black", 3);
  put(points, 19, "black", 5);
  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turn: "white",
    phase: "opening",
    dice: [],
    shown: [],
    cube: 1,
    cubeOwner: "center",
    winner: null,
    score: 0,
    message: "roll",
    rolls: 0,
    lastRoll: [],
  };
}

function checkers(game: Game, point: number, color: Color) {
  const value = game.points[point - 1] ?? 0;
  if (color === "white") return value > 0 ? value : 0;
  return value < 0 ? -value : 0;
}

function occupied(game: Game, point: number) {
  const value = game.points[point - 1] ?? 0;
  if (value > 0) return "white" as const;
  if (value < 0) return "black" as const;
  return null;
}

function homeReady(game: Game, color: Color) {
  if (game.bar[color] > 0) return false;
  for (let point = 1; point <= 24; point += 1) {
    if (checkers(game, point, color) === 0) continue;
    if (color === "white" && point > 6) return false;
    if (color === "black" && point < 19) return false;
  }
  return true;
}

function canLand(game: Game, point: number, color: Color) {
  const owner = occupied(game, point);
  if (!owner || owner === color) return true;
  return checkers(game, point, owner) < 2;
}

function entryPoint(color: Color, face: number) {
  return color === "white" ? 25 - face : face;
}

function step(color: Color, from: number, face: number): number | "off" {
  const raw = color === "white" ? from - face : from + face;
  if (color === "white" && raw < 1) return "off";
  if (color === "black" && raw > 24) return "off";
  return raw;
}

function clone(game: Game): Game {
  return {
    ...game,
    points: game.points.slice(),
    bar: { ...game.bar },
    off: { ...game.off },
    dice: game.dice.slice(),
    shown: game.shown.slice(),
    lastRoll: (game.lastRoll ?? []).slice(),
  };
}

function play(game: Game, move: Move) {
  const color = game.turn;
  const sign = color === "white" ? 1 : -1;
  if (move.from === "bar") game.bar[color] -= 1;
  else game.points[move.from - 1] = (game.points[move.from - 1] ?? 0) - sign;
  if (move.to === "off") {
    game.off[color] += 1;
  } else {
    const owner = occupied(game, move.to);
    if (owner && owner !== color) {
      game.points[move.to - 1] = 0;
      game.bar[owner] += 1;
    }
    game.points[move.to - 1] = (game.points[move.to - 1] ?? 0) + sign;
  }
  const index = game.dice.indexOf(move.die);
  if (index >= 0) game.dice.splice(index, 1);
}

function candidate(game: Game, from: number | "bar", face: number): Move | null {
  const color = game.turn;
  if (game.bar[color] > 0) {
    if (from !== "bar") return null;
    const to = entryPoint(color, face);
    if (!canLand(game, to, color)) return null;
    return { from, to, die: face };
  }
  if (from === "bar" || checkers(game, from, color) === 0) return null;
  const to = step(color, from, face);
  if (to === "off") {
    if (!homeReady(game, color)) return null;
    const exact = color === "white" ? from === face : from === 25 - face;
    if (exact) return { from, to, die: face };
    const further = color === "white"
      ? Array.from({ length: 6 - from }, (_, index) => from + 1 + index).some((point) => checkers(game, point, color) > 0)
      : Array.from({ length: from - 19 }, (_, index) => 19 + index).some((point) => point < from && checkers(game, point, color) > 0);
    if (further) return null;
    return { from, to, die: face };
  }
  if (!canLand(game, to, color)) return null;
  return { from, to, die: face };
}

function sources(game: Game): Array<number | "bar"> {
  if (game.bar[game.turn] > 0) return ["bar"];
  const found: number[] = [];
  for (let point = 1; point <= 24; point += 1) {
    if (checkers(game, point, game.turn) > 0) found.push(point);
  }
  return found;
}

function sequences(game: Game): Move[][] {
  const found: Move[][] = [];
  function walk(current: Game, path: Move[]) {
    let extended = false;
    for (const face of [...new Set(current.dice)]) {
      for (const from of sources(current)) {
        const move = candidate(current, from, face);
        if (!move) continue;
        extended = true;
        const next = clone(current);
        play(next, move);
        walk(next, [...path, move]);
      }
    }
    if (!extended && path.length > 0) found.push(path);
  }
  if (game.dice.length === 0) return [];
  walk(game, []);
  return found;
}

function legalMoves(game: Game): Move[] {
  if (game.phase !== "move") return [];
  const paths = sequences(game);
  if (paths.length === 0) return [];
  const longest = Math.max(...paths.map((path) => path.length));
  const higher = Math.max(...game.dice);
  const mustUseHigher = longest === 1 && game.dice.some((face) => face !== higher) && paths.some((path) => path[0]?.die === higher);
  const seen = new Set<string>();
  const moves: Move[] = [];
  for (const path of paths) {
    if (path.length !== longest) continue;
    if (mustUseHigher && path[0]?.die !== higher) continue;
    const move = path[0];
    if (!move) continue;
    const key = `${move.from}:${move.to}:${move.die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push(move);
  }
  return moves;
}

function finishIfWon(game: Game) {
  const color = game.turn;
  if (game.off[color] < 15) return;
  const loser = opponent(color);
  let multiplier = 1;
  if (game.off[loser] === 0) {
    multiplier = 2;
    const home = color === "white" ? [1, 2, 3, 4, 5, 6] : [19, 20, 21, 22, 23, 24];
    if (game.bar[loser] > 0 || home.some((point) => checkers(game, point, loser) > 0)) multiplier = 3;
  }
  game.phase = "over";
  game.winner = color;
  game.score = game.cube * multiplier;
  game.dice = [];
  game.message = multiplier === 1 ? "game" : multiplier === 2 ? "gammon" : "backgammon";
}

function beginTurn(game: Game, color: Color, faces: number[]) {
  game.turn = color;
  game.shown = faces.slice();
  game.dice = faces[0] === faces[1] ? [faces[0]!, faces[0]!, faces[0]!, faces[0]!] : faces.slice();
  game.phase = "move";
  if (legalMoves(game).length === 0) {
    game.phase = "roll";
    game.turn = opponent(color);
    game.dice = [];
    game.message = "no_move";
    return;
  }
  game.message = "";
}

function roll(game: Game): Game {
  const next = clone(game);
  next.rolls = (game.rolls ?? 0) + 1;
  if (next.phase === "opening") {
    const face = die();
    next.lastRoll = [face];
    const whiteDie = next.shown.length === 1 ? next.shown[0] : null;
    if (whiteDie == null) {
      next.shown = [face];
      next.dice = [];
      next.turn = opponent(next.turn);
      next.message = "roll";
      return next;
    }
    if (whiteDie === face) {
      next.shown = [];
      next.dice = [face];
      next.turn = "white";
      next.message = "tied";
      return next;
    }
    next.shown = [whiteDie, face];
    next.dice = [];
    next.turn = whiteDie > face ? "white" : "black";
    next.phase = "roll";
    next.message = "";
    return next;
  }
  if (next.phase !== "roll") throw new IllegalAction("You cannot roll now");
  const faces = [die(), die()];
  next.lastRoll = faces.slice();
  beginTurn(next, next.turn, faces);
  return next;
}

function move(game: Game, chosen: Move): Game {
  const allowed = legalMoves(game).some((entry) => entry.from === chosen.from && entry.to === chosen.to && entry.die === chosen.die);
  if (!allowed) throw new IllegalAction("That move is not allowed");
  const next = clone(game);
  play(next, chosen);
  finishIfWon(next);
  if (next.phase === "over") return next;
  if (next.dice.length === 0 || legalMoves(next).length === 0) {
    next.turn = opponent(next.turn);
    next.phase = "roll";
    next.dice = [];
    next.message = "";
  }
  return next;
}

function offerDouble(game: Game): Game {
  if (game.phase !== "roll") throw new IllegalAction("You cannot double now");
  if (game.cubeOwner !== "center" && game.cubeOwner !== game.turn) throw new IllegalAction("You do not own the cube");
  if (game.cube >= 64) throw new IllegalAction("The cube is at its limit");
  const next = clone(game);
  next.phase = "offer";
  next.message = "offered";
  return next;
}

function answerDouble(game: Game, accept: boolean): Game {
  if (game.phase !== "offer") throw new IllegalAction("No double is offered");
  const next = clone(game);
  if (!accept) {
    next.phase = "over";
    next.winner = next.turn;
    next.score = next.cube;
    next.message = "declined";
    return next;
  }
  next.cube *= 2;
  next.cubeOwner = opponent(next.turn);
  next.phase = "roll";
  next.message = "";
  return next;
}

/** The color allowed to act next, or null when the game is over. */
function actor(game: Game): Color | null {
  if (game.phase === "over") return null;
  return game.phase === "offer" ? opponent(game.turn) : game.turn;
}

export function apply(game: Game, color: Color, action: Action): Game {
  if (actor(game) !== color) throw new IllegalAction("Not your turn");
  if (action.type === "roll") return roll(game);
  if (action.type === "move") return move(game, { from: action.from, to: action.to, die: action.die });
  if (action.type === "double") return offerDouble(game);
  return answerDouble(game, action.accept);
}
