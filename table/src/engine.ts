import { legacyPokerHand, type TableRecord } from "./store.js";

const engineUrl = process.env.POKER_ENGINE_URL ?? "http://127.0.0.1:4001";
const engineToken = process.env.ENGINE_TOKEN;
if (!engineToken) throw new Error("ENGINE_TOKEN is required");
const engineHeaders = { "x-engine-token": engineToken };

export type Card = { rank: string; suit: string };
export type ActionName = "fold" | "check" | "call" | "bet" | "raise";

export type EngineView = {
  communityCards: Card[];
  pots: { size: number; eligiblePlayers: number[] }[];
  round: "preflop" | "flop" | "turn" | "river" | null;
  playerToActSeat: number | null;
  seats: { seat: number; stack: number; betSize: number; inHand: boolean }[];
  holeCards: { seat: number; cards: Card[] }[];
  legalActions: ActionName[];
  chipRange: { min: number; max: number } | null;
  lastWinners: { seat: number; amount: number }[];
  shownCards: { seat: number; cards: Card[] }[];
};

const backgammonUrl = process.env.BACKGAMMON_ENGINE_URL ?? "http://127.0.0.1:4002";

async function probe(base: string) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function enginesReady() {
  const [poker, backgammon] = await Promise.all([probe(engineUrl), probe(backgammonUrl)]);
  return { poker, backgammon };
}

export async function enginePost<T>(base: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...engineHeaders, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Poker engine failed");
  return payload;
}

type PokerPacket = { hand: unknown; view: EngineView };

type PokerAction =
  | { type: "present" }
  | { type: "seat"; seat: number; stack: number }
  | { type: "add"; seat: number; amount: number }
  | { type: "unseat"; seat: number }
  | { type: "start" }
  | { type: "act"; seat: number; action: ActionName; amount?: number };

function post(path: string, body?: unknown) {
  return enginePost<PokerPacket>(engineUrl, path, body);
}

async function handOf(table: TableRecord) {
  if (table.poker) return table.poker;
  const legacy = await legacyPokerHand(table.id);
  if (!legacy) throw new Error("Game not found");
  return legacy;
}

function keep(table: TableRecord, result: PokerPacket) {
  table.poker = result.hand;
  table.pokerView = result.view;
  return result.view;
}

/** Asks the engine for a new hand and stores that hand on the table. */
export async function createPokerTable(table: TableRecord, smallBlind: number) {
  return keep(table, await post("/games", { smallBlind }));
}

async function apply(table: TableRecord, action: PokerAction) {
  return keep(table, await post("/apply", { hand: await handOf(table), action }));
}

export function seatPoker(table: TableRecord, seat: number, stack: number) {
  return apply(table, { type: "seat", seat, stack });
}

export function addChips(table: TableRecord, seat: number, amount: number) {
  return apply(table, { type: "add", seat, amount });
}

export function unseatPoker(table: TableRecord, seat: number) {
  return apply(table, { type: "unseat", seat });
}

export function startPoker(table: TableRecord) {
  return apply(table, { type: "start" });
}

export function actPoker(table: TableRecord, seat: number, action: ActionName, amount?: number) {
  return apply(table, { type: "act", seat, action, amount });
}

export async function readPoker(table: TableRecord): Promise<EngineView> {
  if (table.poker && table.pokerView) return table.pokerView;
  return (await post("/apply", { hand: await handOf(table), action: { type: "present" } })).view;
}
