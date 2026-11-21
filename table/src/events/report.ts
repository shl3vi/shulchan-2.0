import { EngineFailed, EngineTimeout } from "../engines.js";
import { TableRefused } from "../errors.js";
import type { GameKind } from "../games/index.js";
import { TableBusy, TableNotFound } from "../store.js";
import { publish, type ErrorArea } from "./bus.js";
import { noteError } from "./ledger.js";

export function reportError(input: {
  area: ErrorArea;
  tableId?: string;
  kind?: GameKind;
  route?: string;
  op?: string;
  listener?: string;
}) {
  const data: Record<string, string | number | boolean> = { area: input.area };
  if (input.route) data.route = input.route;
  if (input.op) data.op = input.op;
  if (input.listener) data.listener = input.listener;
  publish({ name: "error", tableId: input.tableId, kind: input.kind, data });
  if (input.tableId) void noteError(input.tableId);
}

/** The PostHog event only says which kind of error it was; the Railway log keeps the message and stack. */
function logError(tableId: string | undefined, route: string, error: unknown) {
  const where = `${route}${tableId ? ` table=${tableId}` : ""}`;
  console.error(`error at ${where}:`, error instanceof Error ? (error.stack ?? error.message) : error);
}

export function reportCaught(tableId: string | undefined, error: unknown, route: string, kind?: GameKind) {
  if (error instanceof TableNotFound) return;
  if (error instanceof TableRefused) {
    reportError({ area: error.reason === "forbidden" ? "forbidden" : "validation", tableId, route, kind });
    return;
  }
  if (error instanceof TableBusy) {
    logError(tableId, route, error);
    reportError({ area: "store", tableId, op: "lock", kind });
    return;
  }
  if (error instanceof EngineTimeout || error instanceof EngineFailed) {
    logError(tableId, route, error);
    reportError({ area: "store", tableId, op: "engine", kind });
    return;
  }
  logError(tableId, route, error);
  reportError({ area: "action", tableId, route, kind });
}
