import { readPoker, unseatPoker } from "./engine.js";
import { publishTable, readTable, writeTable, type TableRecord } from "./store.js";

export async function dropRemovedPlayers(table: TableRecord) {
  const view = await readPoker(table.id);
  const live = new Set(view.seats.map((seat) => seat.seat));
  const players = table.players.filter((player) => !player.pendingRemoval || live.has(player.seat));
  if (players.length === table.players.length) return table;
  table.players = players;
  await writeTable(table);
  return table;
}

export function assignAdmin(table: TableRecord, playerId: string | null) {
  table.adminId = playerId ?? undefined;
  table.adminSecret = crypto.randomUUID();
}

export async function releaseSeat(tableId: string, playerId: string) {
  const table = await readTable(tableId);
  if (!table) throw new Error("Game not found");
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
    await writeTable(table);
  }
  await dropRemovedPlayers(table);
  await publishTable(table.id);
}
