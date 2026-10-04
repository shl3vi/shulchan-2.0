import { createRequire } from "node:module";
import { clearSeed, useSeed } from "./deck.js";

const require = createRequire(import.meta.url);
const { Table } = require("poker-ts") as {
  Table: new (
    blinds: { smallBlind: number; bigBlind: number },
    seats: number,
  ) => PokerTable;
};

const MAX_SEATS = 9;

export type ActionName = "fold" | "check" | "call" | "bet" | "raise";
export type Card = { rank: string; suit: string };

type PlayedAction = { action: ActionName; amount?: number };

export type EngineDoc = {
  smallBlind: number;
  firstHand: boolean;
  button: number;
  seats: Array<number | null>;
  waiting: { seat: number; stack: number }[];
  hand: { seed: number; actions: PlayedAction[] } | null;
  lastWinners: { seat: number; amount: number }[];
  lastShown: { seat: number; cards: Card[] }[];
  lastBoard: Card[];
  leaving: number[];
};

type PokerTable = {
  sitDown(seat: number, stack: number): void;
  startHand(): void;
  isHandInProgress(): boolean;
  isBettingRoundInProgress(): boolean;
  areBettingRoundsCompleted(): boolean;
  endBettingRound(): void;
  showdown(): void;
  actionTaken(action: ActionName, amount?: number): void;
  seats(): Array<{ stack: number; betSize: number } | null>;
  handPlayers(): Array<unknown | null>;
  holeCards(): Array<Card[] | null>;
  communityCards(): Card[];
  pots(): { size: number; eligiblePlayers: number[] }[];
  roundOfBetting(): "preflop" | "flop" | "turn" | "river";
  playerToAct(): number;
  button(): number;
  legalActions(): { actions: ActionName[]; chipRange?: { min: number; max: number; contains(amount: number): boolean } };
  winners(): Array<Array<[number, unknown, unknown]>>;
};

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

function emptyDoc(smallBlind: number): EngineDoc {
  return {
    smallBlind,
    firstHand: true,
    button: 0,
    seats: Array.from({ length: MAX_SEATS }, () => null),
    waiting: [],
    hand: null,
    lastWinners: [],
    lastShown: [],
    lastBoard: [],
    leaving: [],
  };
}

function restore(doc: EngineDoc): PokerTable {
  const table = new Table({ smallBlind: doc.smallBlind, bigBlind: doc.smallBlind * 2 }, MAX_SEATS);
  doc.seats.forEach((stack, seat) => {
    if (stack != null) table.sitDown(seat, stack);
  });
  const internal = (table as unknown as { _table: { _firstTimeButton: boolean; _button: number } })._table;
  internal._firstTimeButton = doc.firstHand;
  internal._button = doc.button;
  if (doc.hand) {
    useSeed(doc.hand.seed);
    table.startHand();
    clearSeed();
    for (const action of doc.hand.actions) {
      play(table, action);
    }
  }
  return table;
}

function play(table: PokerTable, action: PlayedAction) {
  if (action.action === "bet" || action.action === "raise") {
    table.actionTaken(action.action, action.amount);
  } else {
    table.actionTaken(action.action);
  }
  if (!table.isHandInProgress() || table.isBettingRoundInProgress()) return;
  const button = table.button();
  table.endBettingRound();
  if (!table.areBettingRoundsCompleted()) return;
  const pots = table.pots();
  const uncontested = pots.every((pot) => pot.eligiblePlayers.length <= 1);
  const shown = uncontested
    ? []
    : table.holeCards().flatMap((cards, seat) => (cards ? [{ seat, cards }] : []));
  const board = table.communityCards();
  table.showdown();
  (table as unknown as { settledBoard?: Card[] }).settledBoard = board;
  (table as unknown as { settledShown?: EngineDoc["lastShown"] }).settledShown = shown;
  const ranked = table.winners().flatMap((potWinners, potIndex) =>
    potWinners.map(([seat]) => ({
      seat,
      amount: pots[potIndex]?.size ?? 0,
    })),
  );
  const winners = ranked.length
    ? ranked
    : pots.flatMap((pot) =>
        pot.eligiblePlayers.length === 1 ? [{ seat: pot.eligiblePlayers[0]!, amount: pot.size }] : [],
      );
  const settled = table as unknown as { settledWinners?: EngineDoc["lastWinners"]; settledButton?: number };
  settled.settledWinners = winners;
  settled.settledButton = button;
}

export function viewOf(doc: EngineDoc, table: PokerTable): EngineView {
  const inHand = table.isHandInProgress();
  const betting = inHand && table.isBettingRoundInProgress();
  const live = table.seats();
  const handPlayers = inHand ? table.handPlayers() : [];
  const holes = inHand ? table.holeCards() : [];
  const seats = live.flatMap((seat, index) =>
    seat
      ? [{ seat: index, stack: seat.stack, betSize: seat.betSize, inHand: handPlayers[index] != null }]
      : [],
  );
  for (const waiting of doc.waiting) {
    seats.push({ seat: waiting.seat, stack: waiting.stack, betSize: 0, inHand: false });
  }
  const actor = betting ? table.playerToAct() : null;
  const legal = actor != null ? table.legalActions() : null;
  return {
    communityCards: inHand ? table.communityCards() : (doc.lastBoard ?? []),
    pots: inHand ? table.pots() : [],
    round: inHand ? table.roundOfBetting() : null,
    playerToActSeat: actor,
    seats,
    holeCards: holes.flatMap((cards, seat) => (cards ? [{ seat, cards }] : [])),
    shownCards: inHand ? [] : (doc.lastShown ?? []),
    legalActions: legal?.actions ?? [],
    chipRange: legal?.chipRange ? { min: legal.chipRange.min, max: legal.chipRange.max } : null,
    lastWinners: doc.lastWinners,
  };
}

function finish(doc: EngineDoc, table: PokerTable): EngineDoc {
  const settledTable = table as unknown as {
    settledWinners?: EngineDoc["lastWinners"];
    settledShown?: EngineDoc["lastShown"];
    settledBoard?: Card[];
  };
  const settled = settledTable.settledWinners;
  if (table.isHandInProgress()) return doc;
  const leaving = new Set(doc.leaving ?? []);
  const seats = table.seats().map((seat, index) => (leaving.has(index) ? null : (seat?.stack ?? null)));
  for (const waiting of doc.waiting) {
    if (leaving.has(waiting.seat)) continue;
    if (seats[waiting.seat] == null) seats[waiting.seat] = waiting.stack;
  }
  return {
    ...doc,
    firstHand: false,
    button: (table as unknown as { settledButton?: number }).settledButton ?? doc.button,
    seats,
    waiting: [],
    hand: null,
    lastWinners: settled ?? doc.lastWinners,
    lastShown: settledTable.settledShown ?? [],
    lastBoard: settledTable.settledBoard ?? [],
    leaving: [],
  };
}

export function createDoc(smallBlind: number): EngineDoc {
  return emptyDoc(smallBlind);
}

export function seatPlayer(doc: EngineDoc, seat: number, stack: number): EngineDoc {
  if (seat < 0 || seat >= MAX_SEATS) throw new Error("Invalid seat");
  if (doc.seats[seat] != null || doc.waiting.some((player) => player.seat === seat)) {
    throw new Error("Seat is taken");
  }
  if (doc.hand) return { ...doc, waiting: [...doc.waiting, { seat, stack }] };
  const seats = doc.seats.slice();
  seats[seat] = stack;
  return { ...doc, seats };
}

export function unseat(doc: EngineDoc, seat: number): EngineDoc {
  if (seat < 0 || seat >= MAX_SEATS) throw new Error("Invalid seat");
  const waiting = doc.waiting.some((player) => player.seat === seat);
  const seated = doc.seats[seat] != null;
  if (!seated && !waiting) throw new Error("Seat is empty");
  if (doc.hand && seated) {
    const leaving = new Set(doc.leaving ?? []);
    leaving.add(seat);
    return { ...doc, leaving: [...leaving] };
  }
  const seats = doc.seats.slice();
  seats[seat] = null;
  return {
    ...doc,
    seats,
    waiting: doc.waiting.filter((player) => player.seat !== seat),
    leaving: (doc.leaving ?? []).filter((index) => index !== seat),
  };
}

export function startHand(doc: EngineDoc): EngineDoc {
  if (doc.hand) throw new Error("Hand already in progress");
  const seated = doc.seats.filter((stack) => stack != null).length + doc.waiting.length;
  if (seated < 2) throw new Error("Need at least two players");
  const seats = doc.seats.slice();
  for (const waiting of doc.waiting) seats[waiting.seat] = waiting.stack;
  const next: EngineDoc = {
    ...doc,
    seats,
    waiting: [],
    hand: { seed: crypto.getRandomValues(new Uint32Array(1))[0]!, actions: [] },
  };
  restore(next);
  return next;
}

export function act(doc: EngineDoc, seat: number, action: ActionName, amount?: number): EngineDoc {
  if (!doc.hand) throw new Error("No action is open");
  const table = restore(doc);
  if (!table.isHandInProgress() || !table.isBettingRoundInProgress()) throw new Error("No action is open");
  if (table.playerToAct() !== seat) throw new Error("Not your turn");
  const legal = table.legalActions();
  if (!legal.actions.includes(action)) throw new Error("Illegal action");
  if ((action === "bet" || action === "raise") && (amount === undefined || !legal.chipRange?.contains(amount))) {
    throw new Error("Bet size is outside the allowed range");
  }
  const played: PlayedAction = { action, amount };
  play(table, played);
  if (!table.isHandInProgress()) return finish(doc, table);
  return { ...doc, hand: { ...doc.hand, actions: [...doc.hand.actions, played] } };
}

export function present(doc: EngineDoc): EngineView {
  return viewOf(doc, restore(doc));
}
