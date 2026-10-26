import { enginePost } from "./engine.js";
import type { BackgammonAction } from "./schema.js";
import type { TableRecord } from "./store.js";

const backgammonUrl = process.env.BACKGAMMON_ENGINE_URL ?? "http://127.0.0.1:4002";

type Color = "white" | "black";

export function openingBackgammon() {
  return enginePost<unknown>(backgammonUrl, "/games");
}

/** White is the lower seat of the first two seated players, black the other. Everyone else watches. */
function colorOf(table: TableRecord, playerId: string): Color | null {
  const seated = table.players.filter((player) => !player.pendingRemoval).sort((a, b) => a.seat - b.seat);
  const index = seated.findIndex((player) => player.id === playerId);
  return index === 0 ? "white" : index === 1 ? "black" : null;
}

/** Applies one player's action to the table's game. The engine rolls the dice and enforces turns and rules. */
export async function playBackgammon(table: TableRecord, playerId: string, action: BackgammonAction) {
  const current = table.backgammon as { phase?: unknown } | undefined;
  if (action.type === "restart") {
    const color = colorOf(table, playerId);
    if (playerId !== table.adminId && !(color && current?.phase === "over")) {
      throw new Error("Only the table admin can restart a game in progress");
    }
    return openingBackgammon();
  }
  const color = colorOf(table, playerId);
  if (!color) throw new Error("You are watching this game");
  const game = current ?? (await openingBackgammon());
  return enginePost<unknown>(backgammonUrl, "/apply", { game, color, action });
}

export type BackgammonWin = {
  whiteName: string;
  blackName: string;
  winner: "white" | "black";
  points: number;
};

/** Records a finished game once, including one already on the table before the log existed. */
export function noteBackgammonWin(
  table: { players: { name: string; seat: number }[]; backgammon?: unknown; backgammonLog?: BackgammonWin[] },
  next: { phase?: unknown; winner?: unknown; score?: unknown },
) {
  const previous = table.backgammon as { phase?: unknown; winner?: unknown; score?: unknown } | undefined;
  const log = table.backgammonLog ?? [];
  const fresh = next.phase === "over" && previous?.phase !== "over";
  const source = fresh ? next : previous?.phase === "over" && log.length === 0 ? previous : null;
  if (!source || (source.winner !== "white" && source.winner !== "black") || !Number.isInteger(source.score)) return;
  const winner: "white" | "black" = source.winner;
  const seated = [...table.players].sort((a, b) => a.seat - b.seat);
  table.backgammonLog = [...log, {
    whiteName: seated[0]?.name ?? "",
    blackName: seated[1]?.name ?? "",
    winner,
    points: source.score as number,
  }].slice(-40);
}
