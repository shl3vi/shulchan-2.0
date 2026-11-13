import type { Server } from "socket.io";
import { debugConfig } from "./debug.js";
import { summarizeIdle } from "./events/ledger.js";
import { reportCaught } from "./events/report.js";
import { needsIdleWrite, sweepIdle } from "./idle.js";
import { stopMedia } from "./livekit.js";
import { extendPausedTables, listOpenTables, publishTable, removeTable, TABLE_UNCHANGED, TableNotFound, withTable } from "./store.js";

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

async function watch(io: Server) {
  const debugId = debugConfig()?.tableId;
  const open = await listOpenTables();
  for (const row of open) {
    if (row.id === debugId) continue;
    const now = Date.now();
    try {
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
      reportCaught(row.id, error, "idle", row.record.kind);
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
