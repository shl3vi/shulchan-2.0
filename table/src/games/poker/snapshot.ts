import type { TableRecord } from "../../store.js";
import { sharedView } from "../../view.js";
import type { EngineView } from "./engine.js";
import { pokerOf } from "./state.js";
import { turnMs } from "./turn.js";

/** The snapshot the app reads today: the shared view, with poker's fields mixed in. */
export function snapshot(table: TableRecord, view: EngineView, viewerId?: string, blockedIds?: Set<string>) {
  const state = pokerOf(table);
  const shared = sharedView(table, viewerId, blockedIds);
  const bySeat = new Map(table.players.map((player) => [player.seat, player]));
  const actor = view.playerToActSeat == null ? null : bySeat.get(view.playerToActSeat);
  const viewer = viewerId ? table.players.find((player) => player.id === viewerId) : undefined;
  const yourTurn = viewer != null && actor?.id === viewer.id;
  return {
    ...shared,
    status: view.round ? ("playing" as const) : ("waiting" as const),
    smallBlind: state.smallBlind,
    bigBlind: state.smallBlind * 2,
    buyIn: state.buyIn,
    communityCards: view.communityCards,
    pots: view.pots,
    round: view.round,
    playerToActId: actor?.id ?? null,
    players: shared.players.map((player) => {
      const seat = view.seats.find((entry) => entry.seat === player.seat);
      return {
        ...player,
        stack: seat?.stack ?? 0,
        betSize: seat?.betSize ?? 0,
        inHand: seat?.inHand ?? false,
        sittingOut: false,
        bought: state.bought[player.id] ?? state.buyIn,
      };
    }),
    you: shared.you && viewer
      ? {
          ...shared.you,
          holeCards: view.holeCards.find((cards) => cards.seat === viewer.seat)?.cards ?? [],
          legalActions: yourTurn ? view.legalActions : [],
          chipRange: yourTurn ? view.chipRange : null,
        }
      : null,
    autoDeal: state.autoDeal === true,
    /** Seconds each player has to act. */
    turnSeconds: turnMs(state) / 1000,
    /** Who may buy more chips. */
    rebuy: state.rebuy ?? "any",
    /** New small blind that starts with the next hand. */
    ...(view.nextSmallBlind != null ? { nextSmallBlind: view.nextSmallBlind } : {}),
    /** Server epoch ms when the player to act runs out of time. Absent while paused or between hands. */
    ...(state.turn && actor && table.paused !== true && table.closing !== true ? { turnDeadline: state.turn.deadline } : {}),
    shownCards: view.shownCards ?? [],
    lastWinners: view.lastWinners.flatMap((winner) => {
      const player = bySeat.get(winner.seat);
      return player ? [{ seat: winner.seat, name: player.name, amount: winner.amount }] : [];
    }),
  };
}

export type TableSnapshot = ReturnType<typeof snapshot>;
