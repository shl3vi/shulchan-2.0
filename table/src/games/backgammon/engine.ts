import { engineAnswers, enginePost } from "../../engines.js";
import { REFUSAL, TableRefused } from "../../errors.js";
import type { TableRecord } from "../../store.js";
import type { BackgammonAction } from "./schema.js";
import { backgammonOf, colorOf, settledColors, type BackgammonState } from "./state.js";

const backgammonUrl = process.env.BACKGAMMON_ENGINE_URL ?? "http://127.0.0.1:4002";

export function backgammonEngineAnswers() {
  return engineAnswers(backgammonUrl);
}

export function openingBackgammon() {
  return enginePost<unknown>(backgammonUrl, "/games");
}

export async function backgammonMoves(game: unknown) {
  const payload = await enginePost<{ moves?: { from: number | "bar"; to: number | "off"; die: number }[] }>(
    backgammonUrl,
    "/moves",
    { game },
  );
  return payload.moves ?? [];
}

/**
 * Applies one player's action to the table's game and stores the result. The engine rolls the
 * dice and enforces turns and rules. Colours are settled first, so a newcomer can fill an empty one.
 */
export async function playBackgammon(table: TableRecord, playerId: string, action: BackgammonAction) {
  const state = backgammonOf(table);
  const current = state.board as { phase?: unknown } | undefined;
  state.colors = settledColors(table);
  const color = colorOf(state.colors, playerId);
  if (action.type === "restart") {
    if (playerId !== table.adminId && !(color && current?.phase === "over")) {
      throw new TableRefused("forbidden", "Only the table admin can restart a game in progress", REFUSAL.notAdmin);
    }
    const board = await openingBackgammon();
    noteBackgammonWin(table, board as Finished);
    state.board = board;
    // A new game: the first two seated play it.
    state.colors = {};
    state.colors = settledColors(table);
    return board;
  }
  if (!color) throw new TableRefused("invalid", "You are watching this game", REFUSAL.watching);
  const game = current ?? (await openingBackgammon());
  const board = await enginePost<unknown>(backgammonUrl, "/apply", { game, color, action });
  noteBackgammonWin(table, board as Finished);
  state.board = board;
  return board;
}

type Finished = { phase?: unknown; winner?: unknown; score?: unknown };

/** Records a finished game once, as the game ends. */
function noteBackgammonWin(table: TableRecord, next: Finished) {
  const state: BackgammonState = backgammonOf(table);
  const previous = state.board as Finished | undefined;
  if (next.phase !== "over" || previous?.phase === "over") return;
  if ((next.winner !== "white" && next.winner !== "black") || !Number.isInteger(next.score)) return;
  const nameOf = (id?: string) => table.players.find((player) => player.id === id)?.name ?? "";
  state.log = [...state.log, {
    whiteName: nameOf(state.colors.white),
    blackName: nameOf(state.colors.black),
    winner: next.winner as "white" | "black",
    points: next.score as number,
  }].slice(-40);
}
