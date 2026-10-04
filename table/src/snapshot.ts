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
    adminSecret: string | null;
  } | null;
  lastWinners: { seat: number; name: string; amount: number }[];
  shownCards: { seat: number; cards: EngineView["communityCards"] }[];
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
    players: table.players.flatMap((player) => {
      const seat = view.seats.find((entry) => entry.seat === player.seat);
      return [{
        id: player.id,
        name: player.name,
        seat: player.seat,
        stack: seat?.stack ?? 0,
        betSize: seat?.betSize ?? 0,
        inHand: seat?.inHand ?? false,
        sittingOut: false,
      }];
    }),
    you: viewer
      ? {
          id: viewer.id,
          holeCards: view.holeCards.find((cards) => cards.seat === viewer.seat)?.cards ?? [],
          legalActions: yourTurn ? view.legalActions : [],
          chipRange: yourTurn ? view.chipRange : null,
          adminSecret: viewer.id === table.adminId ? table.adminSecret : null,
        }
      : null,
    shownCards: view.shownCards ?? [],
    lastWinners: view.lastWinners.flatMap((winner) => {
      const player = bySeat.get(winner.seat);
      return player ? [{ seat: winner.seat, name: player.name, amount: winner.amount }] : [];
    }),
  };
}
