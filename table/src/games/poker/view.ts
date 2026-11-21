import type { TableRecord } from "../../store.js";
import type { TableStatus } from "../../view.js";
import type { EngineView } from "./engine.js";
import { pokerOf } from "./state.js";
import { turnMs } from "./turn.js";

/** Poker's part of the snapshot, at `game`. The shared fields and status are built around it. */
export function pokerView(table: TableRecord, view: EngineView, viewerId?: string) {
  const state = pokerOf(table);
  const bySeat = new Map(table.players.map((player) => [player.seat, player]));
  const actor = view.playerToActSeat == null ? null : bySeat.get(view.playerToActSeat);
  const viewer = viewerId ? table.players.find((player) => player.id === viewerId) : undefined;
  const yourTurn = viewer != null && actor?.id === viewer.id;
  const status: TableStatus = {
    phase: view.round ? "playing" : "waiting",
    toAct: actor ? [actor.id] : [],
    ...(state.turn && actor && table.paused !== true && table.closing !== true ? { turnDeadline: state.turn.deadline } : {}),
  };
  const game = {
    kind: "poker" as const,
    smallBlind: state.smallBlind,
    bigBlind: state.smallBlind * 2,
    buyIn: state.buyIn,
    /** New small blind that starts with the next hand. */
    ...(view.nextSmallBlind != null ? { nextSmallBlind: view.nextSmallBlind } : {}),
    autoDeal: state.autoDeal === true,
    /** Seconds each player has to act. */
    turnSeconds: turnMs(state) / 1000,
    /** Who may buy more chips. */
    rebuy: state.rebuy ?? "any",
    round: view.round,
    communityCards: view.communityCards,
    pots: view.pots,
    /** Each seated player's chips, by player id. */
    seats: Object.fromEntries(table.players.map((player) => {
      const seat = view.seats.find((entry) => entry.seat === player.seat);
      return [player.id, {
        stack: seat?.stack ?? 0,
        betSize: seat?.betSize ?? 0,
        inHand: seat?.inHand ?? false,
        bought: state.bought[player.id] ?? state.buyIn,
      }];
    })),
    /** This viewer's cards, and their choices when it is their turn. Null for someone not seated. */
    hand: viewer
      ? {
          holeCards: view.holeCards.find((cards) => cards.seat === viewer.seat)?.cards ?? [],
          legalActions: yourTurn ? view.legalActions : [],
          chipRange: yourTurn ? view.chipRange : null,
        }
      : null,
    shownCards: view.shownCards ?? [],
    lastWinners: view.lastWinners.flatMap((winner) => {
      const player = bySeat.get(winner.seat);
      return player ? [{ seat: winner.seat, name: player.name, amount: winner.amount }] : [];
    }),
  };
  return { status, game };
}

export type PokerGameView = ReturnType<typeof pokerView>["game"];
