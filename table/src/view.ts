import { gameOf } from "./games/index.js";
import type { TableRecord } from "./store.js";

/** Where the table's game stands, in terms every screen understands without knowing the game. */
export type TableStatus = {
  /** waiting: nothing to play yet. playing: a hand or game is under way. over: finished, waiting for a restart. */
  phase: "waiting" | "playing" | "over";
  /** Player ids whose move it is. */
  toAct: string[];
  /** Server epoch ms when the server moves for them. Absent when nobody is on a clock. */
  turnDeadline?: number;
};

/** What every viewer sees of a table, whatever its game. */
export function sharedView(table: TableRecord, viewerId?: string, blockedIds?: Set<string>) {
  const viewer = viewerId ? table.players.find((player) => player.id === viewerId) : undefined;
  return {
    id: table.id,
    players: table.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      ...(blockedIds?.has(player.id) ? { blocked: true } : {}),
      ...(player.web ? { web: true } : {}),
    })),
    you: viewer ? { id: viewer.id, isAdmin: viewer.id === table.adminId } : null,
    ...(viewer && viewer.id === table.adminId ? { password: table.password } : {}),
    paused: table.paused === true,
    /** Server epoch ms when this snapshot was built. */
    serverNow: Date.now(),
    /** Server epoch ms. Present only while the idle warning is up. */
    ...(table.idleCloseAt != null && table.paused !== true ? { idleCloseAt: table.idleCloseAt } : {}),
  };
}

/** The whole snapshot: shared fields, the shared status, and the game's own part under `game`. */
export async function tableSnapshot(table: TableRecord, viewerId?: string, blockedIds?: Set<string>) {
  const { status, game } = await gameOf(table).view(table, viewerId);
  return { ...sharedView(table, viewerId, blockedIds), status, game };
}
