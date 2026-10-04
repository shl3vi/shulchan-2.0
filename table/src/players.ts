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

export async function releaseSeat(tableId: string, playerId: string) {
  const table = await readTable(tableId);
  if (!table) throw new Error("Game not found");
  const player = table.players.find((seat) => seat.id === playerId);
  if (!player) throw new Error("Player not found");
  if (!player.pendingRemoval) {
    await unseatPoker(table.id, player.seat);
    player.pendingRemoval = true;
    await writeTable(table);
  }
  await dropRemovedPlayers(table);
  await publishTable(table.id);
}
