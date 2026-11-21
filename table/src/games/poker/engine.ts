import { engineAnswers, enginePost } from "../../engines.js";
import type { TableRecord } from "../../store.js";
import { AUTO_DEAL_DELAY_MS, pokerOf, type PokerState } from "./state.js";
import { stampTurn } from "./turn.js";

const engineUrl = process.env.POKER_ENGINE_URL ?? "http://127.0.0.1:4001";

export type Card = { rank: string; suit: string };
export type ActionName = "fold" | "check" | "call" | "bet" | "raise";

export type EngineView = {
  /** Missing from views stored before blinds could change. */
  smallBlind?: number;
  /** A blinds change waiting for the current hand to end. */
  nextSmallBlind?: number | null;
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

export function pokerEngineAnswers() {
  return engineAnswers(engineUrl);
}

type PokerPacket = { hand: unknown; view: EngineView };

type PokerAction =
  | { type: "present" }
  | { type: "seat"; seat: number; stack: number }
  | { type: "add"; seat: number; amount: number }
  | { type: "unseat"; seat: number }
  | { type: "start" }
  | { type: "blinds"; smallBlind: number }
  | { type: "act"; seat: number; action: ActionName; amount?: number };

function post(path: string, body?: unknown) {
  return enginePost<PokerPacket>(engineUrl, path, body);
}

function handOf(state: PokerState) {
  if (!state.hand) throw new Error("Game not found");
  return state.hand;
}

function keep(state: PokerState, result: PokerPacket, fresh = false) {
  const now = Date.now();
  state.hand = result.hand;
  state.view = result.view;
  // The engine applies a blinds change when the hand ends, so the table follows its blinds.
  if (result.view.smallBlind != null) state.smallBlind = result.view.smallBlind;
  stampTurn(state, result.view, now, fresh);
  // The first change while the table waits starts the auto-deal wait. Later ones do not extend it.
  if (result.view.round == null) state.autoDealAt ??= now + AUTO_DEAL_DELAY_MS;
  else delete state.autoDealAt;
  return result.view;
}

/** Asks the engine for a new, empty hand and keeps it in the state. */
export async function openHand(state: PokerState, smallBlind: number) {
  return keep(state, await post("/games", { smallBlind }));
}

async function apply(table: TableRecord, action: PokerAction) {
  const state = pokerOf(table);
  const fresh = action.type === "act" || action.type === "start";
  return keep(state, await post("/apply", { hand: handOf(state), action }), fresh);
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

/** Between hands the new blinds apply at once; during a hand, from the next one. */
export function setPokerBlinds(table: TableRecord, smallBlind: number) {
  return apply(table, { type: "blinds", smallBlind });
}

export function startPoker(table: TableRecord) {
  return apply(table, { type: "start" });
}

export function actPoker(table: TableRecord, seat: number, action: ActionName, amount?: number) {
  return apply(table, { type: "act", seat, action, amount });
}

export async function readPoker(table: TableRecord): Promise<EngineView> {
  const state = pokerOf(table);
  if (state.hand && state.view) return state.view;
  return (await post("/apply", { hand: handOf(state), action: { type: "present" } })).view;
}
