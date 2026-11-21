import { timingSafeEqual } from "node:crypto";
import { gameOf } from "./games/index.js";
import type { TableRecord } from "./store.js";

/** Equal length and content, without leaking where two secrets differ. */
export function sameSecret(given: string, expected: string | undefined) {
  if (!expected) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function tablePassword() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 900000 + 100000);
}

export function seatedCount(table: TableRecord) {
  return table.players.filter((player) => !player.pendingRemoval).length;
}

export function assignAdmin(table: TableRecord, playerId: string | null) {
  table.adminId = playerId ?? undefined;
}

export async function releaseSeat(table: TableRecord, playerId: string) {
  const player = table.players.find((seat) => seat.id === playerId);
  if (!player) throw new Error("Player not found");
  if (table.adminId === player.id) {
    // A browser player is a guest. With only guests left, the table has no admin until someone joins from the app.
    const staying = table.players.filter((seat) => seat.id !== player.id && !seat.pendingRemoval && !seat.web);
    const next = staying.length === 0 ? null : staying[Math.floor(Math.random() * staying.length)]!.id;
    assignAdmin(table, next);
  }
  const game = gameOf(table);
  if (!player.pendingRemoval) {
    await game.unseat(table, player);
    player.pendingRemoval = true;
  }
  await game.dropDeparted(table);
}
