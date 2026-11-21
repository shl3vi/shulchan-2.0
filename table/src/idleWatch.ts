import type { Server } from "socket.io";
import { isDebugTable } from "./debug.js";
import { summarizeIdle } from "./events/ledger.js";
import { reportCaught } from "./events/report.js";
import { needsIdleWrite, sweepIdle } from "./idle.js";
import { stopMedia } from "./livekit.js";
import { gameOf, kindOf } from "./games/index.js";
import { extendPausedTables, listOpenTables, publishTable, removeTable, TABLE_UNCHANGED, TableNotFound, withTable, type TableRecord } from "./store.js";
import { settleAdmin } from "./admin.js";

const SWEEP_MS = 10_000;

let timer: NodeJS.Timeout | undefined;
let running = false;

async function closeIdle(io: Server, tableId: string, epoch: number | undefined) {
  await summarizeIdle(tableId).catch((error) => {
    reportCaught(tableId, error, "idle");
  });
  await removeTable(tableId);
  const room = io.of("/table");
  room.to(tableId).emit("closed", { reason: "idle" });
  const drop = setTimeout(() => room.in(tableId).disconnectSockets(true), 400);
  drop.unref();
  await stopMedia(tableId, epoch, true);
}

/** Player ids with a live socket on any table process. The Redis adapter answers for the others. */
async function connectedPlayers(io: Server, tableId: string) {
  const sockets = await io.of("/table").in(tableId).fetchSockets();
  return new Set(sockets.map((socket) => String(socket.handshake.auth.playerId ?? "")));
}

async function handOffAdmin(io: Server, tableId: string, record: TableRecord, now: number) {
  if (record.players.length === 0 || record.closing) return;
  const connected = await connectedPlayers(io, tableId);
  // Try it on a copy first, so a table with its admin present is never locked or written.
  const probe = { adminId: record.adminId, adminAwaySince: record.adminAwaySince, players: record.players };
  if (!settleAdmin(probe, connected, now, (items) => items[0]!)) return;
  const changed = await withTable(tableId, async (table) => (settleAdmin(table, connected, Date.now()) ? true : TABLE_UNCHANGED));
  if (changed !== TABLE_UNCHANGED) await publishTable(tableId);
}

async function watch(io: Server) {
  const open = await listOpenTables();
  for (const row of open) {
    const now = Date.now();
    if (isDebugTable(row.id)) {
      // A debug table never closes or changes admin, but its game's timers still run.
      await gameOf(row.record).sweep?.(row.record, now);
      continue;
    }
    try {
      // Before the pause check: a paused table whose admin left can only be resumed by a new admin.
      await handOffAdmin(io, row.id, row.record, now);
      await gameOf(row.record).sweep?.(row.record, now);
      if (row.record.paused) {
        await stopMedia(row.id, row.record.mediaEpoch, false);
        continue;
      }
      if (!needsIdleWrite(row.record, now)) continue;
      const decision = await withTable(row.id, async (table) => {
        const next = sweepIdle(table, Date.now());
        if (next === "hold") return TABLE_UNCHANGED;
        if (next === "close") return { close: true as const, epoch: table.mediaEpoch };
        return next;
      });
      if (decision === TABLE_UNCHANGED) continue;
      if (typeof decision === "object" && decision.close) {
        await closeIdle(io, row.id, decision.epoch);
        continue;
      }
      await publishTable(row.id);
    } catch (error) {
      if (error instanceof TableNotFound) continue;
      reportCaught(row.id, error, "idle", kindOf(row.record));
    }
  }
  await extendPausedTables();
}

export function startIdleWatch(io: Server) {
  if (timer) return;
  const tick = () => {
    if (running) return;
    running = true;
    void watch(io).catch((error) => {
      console.error("Idle watch failed", error instanceof Error ? error.message : error);
    }).finally(() => {
      running = false;
    });
  };
  timer = setInterval(tick, SWEEP_MS);
  timer.unref();
  tick();
}

export function stopIdleWatch() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
