/**
 * The tile engine's set rules, copied so the table can show which sets are good and how close
 * a first play is to 30 points while the player arranges it. The engine still checks every play.
 */
export const COLORS = ["r", "b", "o", "k"] as const;
export const FIRST_MELD = 30;

export function isJoker(tile: string) {
  return tile.startsWith("j");
}

export function colorOf(tile: string) {
  return tile[0] as (typeof COLORS)[number] | "j";
}

export function numberOf(tile: string) {
  return Number.parseInt(tile.slice(1), 10);
}

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

const colorRank = (tile: string) => (isJoker(tile) ? 9 : COLORS.indexOf(colorOf(tile) as (typeof COLORS)[number]));

/** A set in reading order: a run low to high with jokers in its gaps, a group or a set in progress by colour. */
export function arrange(tiles: string[]): string[] {
  const read = readSet(tiles);
  const plain = tiles.filter((tile) => !isJoker(tile));
  const jokers = tiles.filter(isJoker);
  if (read?.kind === "run") {
    const byNumber = new Map(plain.map((tile) => [numberOf(tile), tile]));
    const spare = jokers.slice();
    return read.values.map((value) => byNumber.get(value) ?? spare.shift()!);
  }
  const sameColor = plain.length > 1 && plain.every((tile) => colorOf(tile) === colorOf(plain[0]));
  const sorted = plain.slice().sort((a, b) =>
    sameColor ? numberOf(a) - numberOf(b) : numberOf(a) - numberOf(b) || colorRank(a) - colorRank(b),
  );
  return [...sorted, ...jokers];
}

/** The rack in one of two orders: by colour then number ("runs"), or by number then colour ("groups"). */
export function sortRack(rack: string[], mode: "runs" | "groups") {
  return rack.slice().sort((a, b) => {
    if (isJoker(a) !== isJoker(b)) return isJoker(a) ? 1 : -1;
    if (mode === "runs") return colorRank(a) - colorRank(b) || numberOf(a) - numberOf(b) || a.localeCompare(b);
    return numberOf(a) - numberOf(b) || colorRank(a) - colorRank(b) || a.localeCompare(b);
  });
}

function key(set: string[]) {
  return set.slice().sort().join(",");
}

/**
 * Where a draft stands: whether every set is good, how many points a first play is worth,
 * and whether it leaves the table's earlier sets alone (a first play must).
 */
export function checkDraft(base: string[][], sets: string[][], melded: boolean) {
  const before = new Set(base.flat());
  const allValid = sets.every((set) => readSet(set) != null);
  const remaining = sets.map(key);
  let untouched = true;
  for (const old of base) {
    const at = remaining.indexOf(key(old));
    if (at < 0) untouched = false;
    else remaining.splice(at, 1);
  }
  const own = sets.filter((set) => set.every((tile) => !before.has(tile)));
  const meldPoints = own.reduce((total, set) => total + setValue(set), 0);
  const placed = sets.flat().filter((tile) => !before.has(tile)).length;
  const ok = placed > 0 && allValid && (melded || (untouched && meldPoints >= FIRST_MELD));
  return { allValid, untouched, meldPoints, placed, ok };
}
