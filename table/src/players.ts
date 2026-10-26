import { readPoker, unseatPoker } from "./engine.js";
import type { TableRecord } from "./store.js";

export function seatedCount(table: TableRecord) {
  return table.players.filter((player) => !player.pendingRemoval).length;
}

export async function dropRemovedPlayers(table: TableRecord) {
  const view = await readPoker(table.id);
  const live = new Set(view.seats.map((seat) => seat.seat));
  table.players = table.players.filter((player) => !player.pendingRemoval || live.has(player.seat));
}

export function assignAdmin(table: TableRecord, playerId: string | null) {
  table.adminId = playerId ?? undefined;
}

export async function releaseSeat(table: TableRecord, playerId: string) {
  const player = table.players.find((seat) => seat.id === playerId);
  if (!player) throw new Error("Player not found");
  if (table.adminId === player.id) {
    const staying = table.players.filter((seat) => seat.id !== player.id && !seat.pendingRemoval);
    const next = staying.length === 0 ? null : staying[Math.floor(Math.random() * staying.length)]!.id;
    assignAdmin(table, next);
  }
  if (!player.pendingRemoval) {
    await unseatPoker(table.id, player.seat);
    player.pendingRemoval = true;
  }
  await dropRemovedPlayers(table);
}
