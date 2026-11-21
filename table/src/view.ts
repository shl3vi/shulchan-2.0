import type { TableRecord } from "./store.js";

/** What every viewer sees of a table, whatever its game. Each game adds its own part. */
export function sharedView(table: TableRecord, viewerId?: string, blockedIds?: Set<string>) {
  const viewer = viewerId ? table.players.find((player) => player.id === viewerId) : undefined;
  return {
    id: table.id,
    kind: table.game.kind,
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

export type SharedView = ReturnType<typeof sharedView>;
