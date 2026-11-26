import { randomInt } from "node:crypto";

/** The thirteen boxes on a scorecard, in the order the card shows them. */
export const CATEGORIES = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "threeKind",
  "fourKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "fiveKind",
  "chance",
] as const;

export type Category = (typeof CATEGORIES)[number];

const UPPER: Category[] = ["ones", "twos", "threes", "fours", "fives", "sixes"];
export const UPPER_BONUS_AT = 63;
export const UPPER_BONUS = 35;
export const FIVE_KIND_BONUS = 100;
export const ROLLS_PER_TURN = 3;
export const MAX_PLAYERS = 6;

export type Player = {
  id: string;
  name: string;
  scores: Partial<Record<Category, number>>;
  /** Extra five-of-a-kinds after the five-of-a-kind box already holds 50. */
  fiveKindBonus: number;
  /** Left the table. Their turns are skipped and their card stays as it was. */
  left?: boolean;
  /** The card's total with bonuses, worked out again on every answer. */
  total?: number;
};

export type Game = {
  players: Player[];
  /** Index into `players` of whose turn it is. */
  turn: number;
  dice: number[];
  held: boolean[];
  /** Rolls left this turn. 3 before the first roll; a box can be scored once it is below 3. */
  rollsLeft: number;
  /** Counts every roll, so phones can tell a new roll from the same faces again. */
  rolls: number;
  phase: "playing" | "over";
  /** The last box someone scored, for the phones to call out. */
  last: { playerId: string; category: Category; points: number } | null;
  /** Player ids with the highest total, once the game is over. */
  winners: string[];
};

export type Action =
  | { type: "roll" }
  | { type: "hold"; held: boolean[] }
  | { type: "score"; category: Category };

export class IllegalAction extends Error {}

function die() {
  return randomInt(1, 7);
}

function counts(dice: number[]) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const face of dice) out[face] += 1;
  return out;
}

function sum(dice: number[]) {
  return dice.reduce((total, face) => total + face, 0);
}

function hasRun(dice: number[], length: number) {
  const faces = new Set(dice);
  for (let start = 1; start + length - 1 <= 6; start += 1) {
    let run = true;
    for (let face = start; face < start + length; face += 1) if (!faces.has(face)) run = false;
    if (run) return true;
  }
  return false;
}

/**
 * What these dice score in a box. A five-of-a-kind, once the five-of-a-kind box is filled (with 50
 * or with 0), is a joker: it fills full house and the straights at full value. Only a 50 there
 * earns the extra 100.
 */
export function scoreFor(category: Category, dice: number[], player?: Player): number {
  const tally = counts(dice);
  const most = Math.max(...tally);
  const joker = most === 5 && player?.scores.fiveKind !== undefined;
  const upper = UPPER.indexOf(category);
  if (upper >= 0) return tally[upper + 1] * (upper + 1);
  switch (category) {
    case "threeKind":
      return most >= 3 ? sum(dice) : 0;
    case "fourKind":
      return most >= 4 ? sum(dice) : 0;
    case "fullHouse":
      return joker || (tally.includes(3) && tally.includes(2)) ? 25 : 0;
    case "smallStraight":
      return joker || hasRun(dice, 4) ? 30 : 0;
    case "largeStraight":
      return joker || hasRun(dice, 5) ? 40 : 0;
    case "fiveKind":
      return most === 5 ? 50 : 0;
    case "chance":
      return sum(dice);
    default:
      return 0;
  }
}

export function upperTotal(player: Player) {
  return UPPER.reduce((total, category) => total + (player.scores[category] ?? 0), 0);
}

export function total(player: Player) {
  const boxes = CATEGORIES.reduce((sumSoFar, category) => sumSoFar + (player.scores[category] ?? 0), 0);
  const bonus = upperTotal(player) >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
  return boxes + bonus + player.fiveKindBonus * FIVE_KIND_BONUS;
}

export function newGame(players: { id: string; name: string }[]): Game {
  if (players.length === 0) throw new IllegalAction("Nobody is seated");
  return {
    players: players.slice(0, MAX_PLAYERS).map((player) => ({ id: player.id, name: player.name, scores: {}, fiveKindBonus: 0 })),
    turn: 0,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    rollsLeft: ROLLS_PER_TURN,
    rolls: 0,
    phase: "playing",
    last: null,
    winners: [],
  };
}

function cardFull(player: Player) {
  return CATEGORIES.every((category) => player.scores[category] !== undefined);
}

/** Ends the game when every player still here has a full card, and names the winners. */
function settle(game: Game): Game {
  const here = game.players.filter((player) => !player.left);
  if (here.length > 0 && !here.every(cardFull)) return game;
  const ranked = game.players.filter((player) => !player.left);
  const pool = ranked.length > 0 ? ranked : game.players;
  const best = Math.max(...pool.map(total));
  return { ...game, phase: "over", winners: pool.filter((player) => total(player) === best).map((player) => player.id) };
}

/** The next player after `from` who is still here and has boxes left, or -1. */
function nextTurn(game: Game, from: number) {
  for (let step = 1; step <= game.players.length; step += 1) {
    const index = (from + step) % game.players.length;
    const player = game.players[index];
    if (!player.left && !cardFull(player)) return index;
  }
  return -1;
}

function freshTurn(game: Game, turn: number): Game {
  return { ...game, turn, held: [false, false, false, false, false], rollsLeft: ROLLS_PER_TURN };
}

/** The game as the engine answers it: every player's total filled in. */
export function present(game: Game): Game {
  return { ...game, players: game.players.map((player) => ({ ...player, total: total(player) })) };
}

export function apply(game: Game, playerId: string, action: Action): Game {
  if (game.phase === "over") throw new IllegalAction("The game is over");
  const current = game.players[game.turn];
  if (!current || current.id !== playerId) throw new IllegalAction("Not your turn");

  if (action.type === "roll") {
    if (game.rollsLeft <= 0) throw new IllegalAction("No rolls left. Pick a box.");
    // The first roll of a turn throws all five; holds only count after it.
    const first = game.rollsLeft === ROLLS_PER_TURN;
    if (!first && game.held.every(Boolean)) throw new IllegalAction("Every die is kept");
    const dice = game.dice.map((face, index) => (!first && game.held[index] ? face : die()));
    return { ...game, dice, held: first ? [false, false, false, false, false] : game.held, rollsLeft: game.rollsLeft - 1, rolls: game.rolls + 1 };
  }

  if (action.type === "hold") {
    if (game.rollsLeft === ROLLS_PER_TURN) throw new IllegalAction("Roll first");
    if (game.rollsLeft === 0) throw new IllegalAction("No rolls left. Pick a box.");
    if (!Array.isArray(action.held) || action.held.length !== 5) throw new IllegalAction("Invalid request");
    return { ...game, held: action.held.map(Boolean) };
  }

  if (action.type === "score") {
    if (game.rollsLeft === ROLLS_PER_TURN) throw new IllegalAction("Roll first");
    if (!CATEGORIES.includes(action.category)) throw new IllegalAction("Invalid request");
    if (current.scores[action.category] !== undefined) throw new IllegalAction("That box is already used");
    const points = scoreFor(action.category, game.dice, current);
    const extraFive = counts(game.dice).includes(5) && current.scores.fiveKind === 50;
    const scored: Player = {
      ...current,
      scores: { ...current.scores, [action.category]: points },
      fiveKindBonus: current.fiveKindBonus + (extraFive ? 1 : 0),
    };
    const players = game.players.map((player, index) => (index === game.turn ? scored : player));
    const next: Game = { ...game, players, last: { playerId, category: action.category, points } };
    const settled = settle(next);
    if (settled.phase === "over") return { ...settled, rollsLeft: 0 };
    return freshTurn(settled, nextTurn(settled, game.turn));
  }

  throw new IllegalAction("Invalid request");
}

/** A player left the table. Their turns are skipped; the game ends if nobody else has boxes left. */
export function leave(game: Game, playerId: string): Game {
  const index = game.players.findIndex((player) => player.id === playerId);
  if (index < 0 || game.players[index].left || game.phase === "over") return game;
  const players = game.players.map((player, at) => (at === index ? { ...player, left: true } : player));
  const next = settle({ ...game, players });
  if (next.phase === "over") return next;
  if (game.turn !== index) return next;
  const turn = nextTurn(next, index);
  return turn < 0 ? settle(next) : freshTurn(next, turn);
}
