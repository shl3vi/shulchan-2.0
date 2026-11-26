import { randomInt } from "node:crypto";

/**
 * Tile rummy. 106 tiles: numbers 1 to 13 in four colours, twice each, and two jokers.
 * A tile id is its colour letter, number and copy, e.g. "r7a", or "j1" and "j2" for the jokers.
 */
export const COLORS = ["r", "b", "o", "k"] as const;
export type TileColor = (typeof COLORS)[number];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const HAND = 14;
export const FIRST_MELD = 30;
export const JOKER_PENALTY = 30;

export type Player = {
  id: string;
  name: string;
  rack: string[];
  /** Has laid down the first 30 points from their own rack. */
  melded: boolean;
  left?: boolean;
};

export type Game = {
  players: Player[];
  turn: number;
  /** Face-down tiles to draw from. */
  pool: string[];
  /** Sets on the table, each a list of tile ids. */
  table: string[][];
  phase: "playing" | "over";
  /** Turns in a row that drew nothing because the pool was empty. */
  passes: number;
  last: { playerId: string; kind: "play" | "draw" | "pass"; tiles: number } | null;
  /** Counts every turn, so phones can tell a new turn from the same table again. */
  turns: number;
  winners: string[];
  /** Final points per player id once the game is over: the winner gains what the others lose. */
  points: Record<string, number>;
};

export type Action = { type: "play"; table: string[][] } | { type: "draw" };

export class IllegalAction extends Error {}

export function isJoker(tile: string) {
  return tile.startsWith("j");
}

export function colorOf(tile: string) {
  return tile[0] as TileColor;
}

export function numberOf(tile: string) {
  return Number.parseInt(tile.slice(1), 10);
}

function allTiles() {
  const tiles: string[] = [];
  for (const color of COLORS) {
    for (let number = 1; number <= 13; number += 1) {
      tiles.push(`${color}${number}a`, `${color}${number}b`);
    }
  }
  tiles.push("j1", "j2");
  return tiles;
}

const KNOWN = new Set(allTiles());

function shuffled<T>(items: T[]) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = randomInt(0, index + 1);
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

/**
 * What a set is, if it is one: a group (3 or 4 of a number, each colour once) or a run
 * (3 or more in a row, one colour). Jokers fill in. Returns the value each tile counts for.
 */
export function readSet(tiles: string[]): { kind: "group" | "run"; values: number[] } | null {
  if (tiles.length < 3) return null;
  const plain = tiles.filter((tile) => !isJoker(tile));
  const jokers = tiles.length - plain.length;
  if (plain.length === 0) return null;
  const options: { kind: "group" | "run"; values: number[] }[] = [];

  const number = numberOf(plain[0]);
  const colors = new Set(plain.map(colorOf));
  if (tiles.length <= 4 && plain.every((tile) => numberOf(tile) === number) && colors.size === plain.length) {
    options.push({ kind: "group", values: tiles.map(() => number) });
  }

  const color = colorOf(plain[0]);
  const numbers = plain.map(numberOf);
  if (tiles.length <= 13 && plain.every((tile) => colorOf(tile) === color) && new Set(numbers).size === numbers.length) {
    const low = Math.min(...numbers);
    const high = Math.max(...numbers);
    // The run sits as high as it can, so jokers at the ends count for the most.
    const start = Math.min(low, 14 - tiles.length);
    if (start >= 1 && start + tiles.length - 1 >= high && jokers >= high - low + 1 - plain.length) {
      options.push({ kind: "run", values: Array.from({ length: tiles.length }, (_, index) => start + index) });
    }
  }

  if (options.length === 0) return null;
  const sum = (option: { values: number[] }) => option.values.reduce((total, value) => total + value, 0);
  return options.sort((a, b) => sum(b) - sum(a))[0];
}

export function setValue(tiles: string[]) {
  return readSet(tiles)?.values.reduce((total, value) => total + value, 0) ?? 0;
}

/** What a rack costs its player at the end. A joker costs 30. */
export function rackValue(rack: string[]) {
  return rack.reduce((total, tile) => total + (isJoker(tile) ? JOKER_PENALTY : numberOf(tile)), 0);
}

/** A set in reading order: a run low to high with jokers in its gaps, a group by colour. */
export function arrange(tiles: string[]): string[] {
  const read = readSet(tiles);
  const plain = tiles.filter((tile) => !isJoker(tile));
  const jokers = tiles.filter(isJoker);
  if (read?.kind === "run") {
    const byNumber = new Map(plain.map((tile) => [numberOf(tile), tile]));
    const spare = jokers.slice();
    return read.values.map((value) => byNumber.get(value) ?? spare.shift()!);
  }
  return [...plain.sort((a, b) => COLORS.indexOf(colorOf(a)) - COLORS.indexOf(colorOf(b)) || numberOf(a) - numberOf(b)), ...jokers];
}

export function newGame(players: { id: string; name: string }[]): Game {
  if (players.length < MIN_PLAYERS) throw new IllegalAction("Tiles needs two players");
  const pool = shuffled(allTiles());
  const seated = players.slice(0, MAX_PLAYERS).map((player) => ({
    id: player.id,
    name: player.name,
    rack: pool.splice(0, HAND),
    melded: false,
  }));
  return {
    players: seated,
    turn: randomInt(0, seated.length),
    pool,
    table: [],
    phase: "playing",
    passes: 0,
    last: null,
    turns: 0,
    winners: [],
    points: {},
  };
}

function active(game: Game) {
  return game.players.filter((player) => !player.left);
}

function nextTurn(game: Game, from: number) {
  for (let step = 1; step <= game.players.length; step += 1) {
    const index = (from + step) % game.players.length;
    if (!game.players[index].left) return index;
  }
  return from;
}

/** Ends the game: `winners` take what everyone else still holds. */
function finish(game: Game, winners: string[]): Game {
  const points: Record<string, number> = {};
  let pot = 0;
  for (const player of game.players) {
    if (winners.includes(player.id)) continue;
    const owed = rackValue(player.rack);
    points[player.id] = -owed;
    pot += owed;
  }
  // A pot that does not split evenly gives its odd points to the first winners in seat order, so the points still add up to zero.
  const share = Math.floor(pot / winners.length);
  const odd = pot - share * winners.length;
  winners.forEach((id, at) => {
    points[id] = share + (at < odd ? 1 : 0);
  });
  return { ...game, phase: "over", winners, points };
}

function lowestRacks(game: Game) {
  const here = active(game);
  const best = Math.min(...here.map((player) => rackValue(player.rack)));
  return here.filter((player) => rackValue(player.rack) === best).map((player) => player.id);
}

function key(set: string[]) {
  return set.slice().sort().join(",");
}

function play(game: Game, index: number, next: string[][]): Game {
  const player = game.players[index];
  if (!Array.isArray(next) || !next.every((set) => Array.isArray(set) && set.every((tile) => typeof tile === "string"))) {
    throw new IllegalAction("Invalid request");
  }
  const sets = next.filter((set) => set.length > 0);
  const placed = sets.flat();
  if (placed.some((tile) => !KNOWN.has(tile)) || new Set(placed).size !== placed.length) throw new IllegalAction("Invalid request");

  const before = new Set(game.table.flat());
  for (const tile of before) {
    if (!placed.includes(tile)) throw new IllegalAction("Tiles on the table stay on the table");
  }
  const fromRack = placed.filter((tile) => !before.has(tile));
  if (fromRack.length === 0) throw new IllegalAction("Play at least one tile from your rack, or draw");
  const rack = new Set(player.rack);
  if (fromRack.some((tile) => !rack.has(tile))) throw new IllegalAction("That tile is not on your rack");
  if (sets.some((set) => !readSet(set))) throw new IllegalAction("Every set needs 3 or more tiles in a group or a run");

  if (!player.melded) {
    const remaining = sets.map(key);
    for (const old of game.table) {
      const at = remaining.indexOf(key(old));
      if (at < 0) throw new IllegalAction(`Lay down ${FIRST_MELD} points from your own rack before changing the table`);
      remaining.splice(at, 1);
    }
    const ownSets = sets.filter((set) => set.every((tile) => !before.has(tile)));
    const value = ownSets.reduce((total, set) => total + setValue(set), 0);
    if (value < FIRST_MELD) throw new IllegalAction(`Your first play needs ${FIRST_MELD} points. This is ${value}.`);
  }

  const left = player.rack.filter((tile) => !fromRack.includes(tile));
  const players = game.players.map((entry, at) => (at === index ? { ...entry, rack: left, melded: true } : entry));
  const played: Game = {
    ...game,
    players,
    table: sets.map(arrange),
    passes: 0,
    last: { playerId: player.id, kind: "play", tiles: fromRack.length },
    turns: game.turns + 1,
  };
  if (left.length === 0) return finish(played, [player.id]);
  return { ...played, turn: nextTurn(played, index) };
}

function draw(game: Game, index: number): Game {
  const player = game.players[index];
  if (game.pool.length === 0) {
    const passes = game.passes + 1;
    const passed: Game = { ...game, passes, last: { playerId: player.id, kind: "pass", tiles: 0 }, turns: game.turns + 1 };
    // Nobody could draw for a whole round: the lowest rack wins.
    if (passes >= active(game).length) return finish(passed, lowestRacks(passed));
    return { ...passed, turn: nextTurn(passed, index) };
  }
  const [tile, ...pool] = game.pool;
  const players = game.players.map((entry, at) => (at === index ? { ...entry, rack: [...entry.rack, tile] } : entry));
  const drew: Game = { ...game, players, pool, passes: 0, last: { playerId: player.id, kind: "draw", tiles: 1 }, turns: game.turns + 1 };
  return { ...drew, turn: nextTurn(drew, index) };
}

export function apply(game: Game, playerId: string, action: Action): Game {
  if (game.phase === "over") throw new IllegalAction("The game is over");
  const index = game.turn;
  if (game.players[index]?.id !== playerId) throw new IllegalAction("Not your turn");
  if (action.type === "play") return play(game, index, action.table);
  if (action.type === "draw") return draw(game, index);
  throw new IllegalAction("Invalid request");
}

/** A player left the table. Their turns are skipped; the last player still here wins. */
export function leave(game: Game, playerId: string): Game {
  const index = game.players.findIndex((player) => player.id === playerId);
  if (index < 0 || game.players[index].left || game.phase === "over") return game;
  const players = game.players.map((player, at) => (at === index ? { ...player, left: true } : player));
  const next: Game = { ...game, players };
  const here = active(next);
  if (here.length <= 1) return finish(next, here.map((player) => player.id));
  return game.turn === index ? { ...next, turn: nextTurn(next, index), turns: next.turns + 1 } : next;
}
