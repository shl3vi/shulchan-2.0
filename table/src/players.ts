import { timingSafeEqual } from "node:crypto";
import { actPoker, readPoker, unseatPoker } from "./engine.js";
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

const MAX_SEATS = 9;

/** A departed player no longer has a socket that can act, so fold them when the hand is waiting on that seat. */
export async function foldDeparted(table: TableRecord) {
  if (table.kind === "backgammon") return;
  for (let guard = 0; guard < MAX_SEATS; guard += 1) {
    const view = await readPoker(table);
    const seat = view.playerToActSeat;
    if (seat == null || !view.legalActions.includes("fold")) return;
    const actor = table.players.find((player) => player.seat === seat);
    if (!actor?.pendingRemoval) return;
    await actPoker(table, seat, "fold");
  }
}

export async function dropRemovedPlayers(table: TableRecord) {
  const view = await readPoker(table);
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
    await unseatPoker(table, player.seat);
    player.pendingRemoval = true;
  }
  await dropRemovedPlayers(table);
  await foldDeparted(table);
  await dropRemovedPlayers(table);
}
