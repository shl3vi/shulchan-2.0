import { Table } from "poker-ts";
import type { Action, Card } from "poker-ts/dist/facade/poker.js";
import { v4 as uuid } from "uuid";

const MAX_SEATS = 6;

export type PublicCard = { rank: Card["rank"]; suit: Card["suit"] };

export type PublicPlayer = {
  id: string;
  name: string;
  seat: number;
  stack: number;
  betSize: number;
  inHand: boolean;
  sittingOut: boolean;
};

export type TableSnapshot = {
  id: string;
  status: "waiting" | "playing";
  smallBlind: number;
  bigBlind: number;
  communityCards: PublicCard[];
  pots: { size: number; eligiblePlayers: number[] }[];
  round: "preflop" | "flop" | "turn" | "river" | null;
  playerToActId: string | null;
  players: PublicPlayer[];
  you: {
    id: string;
    holeCards: PublicCard[];
    legalActions: Action[];
    chipRange: { min: number; max: number } | null;
  } | null;
  lastWinners: { name: string; amount: number }[];
};

type SeatPlayer = {
  id: string;
  name: string;
  secret: string;
  seat: number;
  sittingOut: boolean;
};

export class TableGame {
  readonly id = uuid();
  readonly adminSecret = uuid();
  readonly smallBlind: number;
  readonly buyIn: number;

  private readonly table: InstanceType<typeof Table>;
  private readonly players: SeatPlayer[] = [];
  private status: "waiting" | "playing" = "waiting";
  private lastWinners: { name: string; amount: number }[] = [];
  private pendingAction: ((value: [Action, number | undefined]) => void) | null = null;
  private onChange: (() => void) | null = null;

  constructor(smallBlind: number, buyIn: number) {
    this.smallBlind = smallBlind;
    this.buyIn = buyIn;
    this.table = new Table(
      { smallBlind, bigBlind: smallBlind * 2 },
      MAX_SEATS,
    );
  }

  setOnChange(listener: () => void) {
    this.onChange = listener;
  }

  private emit() {
    this.onChange?.();
  }

  join(name: string): { id: string; secret: string } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    if (this.players.length >= MAX_SEATS) throw new Error("Table is full");

    const takenSeats = new Set(this.players.map((player) => player.seat));
    const seat = Array.from({ length: MAX_SEATS }, (_, index) => index).find(
      (index) => !takenSeats.has(index),
    );
    if (seat === undefined) throw new Error("Table is full");

    const player: SeatPlayer = {
      id: uuid(),
      name: trimmed,
      secret: uuid(),
      seat,
      sittingOut: false,
    };
    this.players.push(player);

    if (!this.table.isHandInProgress()) {
      this.table.sitDown(seat, this.buyIn);
    }
    this.emit();
    return { id: player.id, secret: player.secret };
  }

  private playerById(id: string) {
    return this.players.find((player) => player.id === id);
  }

  private playerBySeat(seat: number) {
    return this.players.find((player) => player.seat === seat);
  }

  assertPlayer(playerId: string, secret: string) {
    const player = this.playerById(playerId);
    if (!player || player.secret !== secret) {
      throw new Error("Invalid player");
    }
    return player;
  }

  start(adminSecret: string) {
    if (adminSecret !== this.adminSecret) throw new Error("Not the table admin");
    if (this.table.isHandInProgress()) throw new Error("Hand already in progress");
    this.seatWaitingPlayers();
    const seated = this.table.seats().filter((seat) => seat !== null).length;
    if (seated < 2) throw new Error("Need at least two players");
    this.status = "playing";
    this.table.startHand();
    this.emit();
  }

  act(playerId: string, secret: string, action: Action, amount?: number) {
    const player = this.assertPlayer(playerId, secret);
    if (!this.table.isHandInProgress() || !this.table.isBettingRoundInProgress()) {
      throw new Error("No action is open");
    }
    if (this.table.playerToAct() !== player.seat) {
      throw new Error("Not your turn");
    }
    const legal = this.table.legalActions();
    if (!legal.actions.includes(action)) {
      throw new Error("Illegal action");
    }
    if (action === "bet" || action === "raise") {
      if (amount === undefined || !legal.chipRange?.contains(amount)) {
        throw new Error("Bet size is outside the allowed range");
      }
    }
    const resolve = this.pendingAction;
    if (!resolve) throw new Error("Table is not waiting for an action");
    this.pendingAction = null;
    resolve([action, amount]);
  }

  async runHand() {
    try {
      while (this.table.isHandInProgress()) {
        while (this.table.isBettingRoundInProgress()) {
          this.emit();
          const seat = this.table.playerToAct();
          const actor = this.playerBySeat(seat);
          const [action, amount] = await this.takeAction(actor);
          if (action === "bet" || action === "raise") {
            this.table.actionTaken(action, amount);
          } else {
            this.table.actionTaken(action);
          }
        }
        this.table.endBettingRound();
        if (this.table.areBettingRoundsCompleted()) {
          const pots = this.table.pots();
          this.table.showdown();
          this.lastWinners = this.table.winners().flatMap((potWinners, potIndex) =>
            potWinners.map(([seat]) => ({
              name: this.playerBySeat(seat)?.name ?? "Player",
              amount: pots[potIndex]?.size ?? 0,
            })),
          );
          this.seatWaitingPlayers();
          this.emit();
        }
      }
    } catch (error) {
      console.error("Hand failed", error);
      this.emit();
    }
  }

  private takeAction(actor: SeatPlayer | undefined): Promise<[Action, number | undefined]> {
    if (!actor || actor.sittingOut) {
      const legal = this.table.legalActions();
      const action: Action = legal.actions.includes("check") ? "check" : "fold";
      return Promise.resolve([action, undefined]);
    }
    return new Promise((resolve) => {
      this.pendingAction = resolve;
    });
  }

  private seatWaitingPlayers() {
    if (this.table.isHandInProgress()) return;
    for (const player of this.players) {
      if (player.sittingOut) continue;
      if (this.table.seats()[player.seat] === null) {
        this.table.sitDown(player.seat, this.buyIn);
      }
    }
  }

  snapshot(viewerId?: string): TableSnapshot {
    const inHand = this.table.isHandInProgress();
    const betting = inHand && this.table.isBettingRoundInProgress();
    const seats = this.table.seats();
    const holes = inHand ? this.table.holeCards() : [];
    const handPlayers = inHand ? this.table.handPlayers() : [];
    const viewer = viewerId ? this.playerById(viewerId) : undefined;
    const yourTurn = !!viewer && betting && this.table.playerToAct() === viewer.seat;
    const legal = yourTurn ? this.table.legalActions() : null;

    return {
      id: this.id,
      status: this.status,
      smallBlind: this.smallBlind,
      bigBlind: this.smallBlind * 2,
      communityCards: inHand ? this.table.communityCards() : [],
      pots: inHand ? this.table.pots() : [],
      round: inHand ? this.table.roundOfBetting() : null,
      playerToActId: betting
        ? (this.playerBySeat(this.table.playerToAct())?.id ?? null)
        : null,
      players: this.players.map((player) => {
        const seat = seats[player.seat];
        return {
          id: player.id,
          name: player.name,
          seat: player.seat,
          stack: seat?.stack ?? 0,
          betSize: seat?.betSize ?? 0,
          inHand: handPlayers[player.seat] != null,
          sittingOut: player.sittingOut,
        };
      }),
      you: viewer
        ? {
            id: viewer.id,
            holeCards: (holes[viewer.seat] ?? []) as PublicCard[],
            legalActions: legal?.actions ?? [],
            chipRange: legal?.chipRange
              ? { min: legal.chipRange.min, max: legal.chipRange.max }
              : null,
          }
        : null,
      lastWinners: this.lastWinners,
    };
  }
}

const games = new Map<string, TableGame>();

export function createGame(smallBlind: number, buyIn: number) {
  const game = new TableGame(smallBlind, buyIn);
  games.set(game.id, game);
  return game;
}

export function getGame(id: string) {
  return games.get(id);
}
