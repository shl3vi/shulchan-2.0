import type { EngineView } from "./engine.js";
import type { TableRecord } from "./store.js";

export type TableSnapshot = {
  id: string;
  status: "waiting" | "playing";
  smallBlind: number;
  bigBlind: number;
  communityCards: EngineView["communityCards"];
  pots: EngineView["pots"];
  round: EngineView["round"];
  playerToActId: string | null;
  players: {
    id: string;
    name: string;
    seat: number;
    stack: number;
    betSize: number;
    inHand: boolean;
    sittingOut: boolean;
  }[];
  you: {
    id: string;
    holeCards: EngineView["communityCards"];
    legalActions: EngineView["legalActions"];
    chipRange: { min: number; max: number } | null;
  } | null;
  lastWinners: { name: string; amount: number }[];
};

export function snapshot(table: TableRecord, view: EngineView, viewerId?: string): TableSnapshot {
  const bySeat = new Map(table.players.map((player) => [player.seat, player]));
  const actor = view.playerToActSeat == null ? null : bySeat.get(view.playerToActSeat);
  const viewer = viewerId ? table.players.find((player) => player.id === viewerId) : undefined;
  const yourTurn = viewer != null && actor?.id === viewer.id;
  return {
    id: table.id,
    status: view.round ? "playing" : "waiting",
    smallBlind: table.smallBlind,
    bigBlind: table.smallBlind * 2,
    communityCards: view.communityCards,
    pots: view.pots,
    round: view.round,
    playerToActId: actor?.id ?? null,
    players: view.seats.flatMap((seat) => {
      const player = bySeat.get(seat.seat);
      if (!player) return [];
      return [{
        id: player.id,
        name: player.name,
        seat: seat.seat,
        stack: seat.stack,
        betSize: seat.betSize,
        inHand: seat.inHand,
        sittingOut: false,
      }];
    }),
    you: viewer
      ? {
          id: viewer.id,
          holeCards: view.holeCards.find((cards) => cards.seat === viewer.seat)?.cards ?? [],
          legalActions: yourTurn ? view.legalActions : [],
          chipRange: yourTurn ? view.chipRange : null,
        }
      : null,
    lastWinners: view.lastWinners.flatMap((winner) => {
      const player = bySeat.get(winner.seat);
      return player ? [{ name: player.name, amount: winner.amount }] : [];
    }),
  };
}
