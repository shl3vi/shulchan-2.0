import { EngineTimeout } from "../engine.js";
import { TableNotFound } from "../store.js";
import { publish, type ErrorArea } from "./bus.js";
import { noteError } from "./ledger.js";

export function reportError(input: {
  area: ErrorArea;
  tableId?: string;
  kind?: "poker" | "backgammon";
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

export function reportCaught(tableId: string | undefined, error: unknown, route: string, kind?: "poker" | "backgammon") {
  if (error instanceof TableNotFound) return;
  const message = error instanceof Error ? error.message : "";
  if (message === "Not the table admin" || message === "This table is not backgammon" || message === "This table is not poker") {
    reportError({ area: "forbidden", tableId, route, kind });
    return;
  }
  if (
    message === "Table is paused" ||
    message === "Table is closing" ||
    message.startsWith("Buy-in") ||
    message === "Rebuys are off at this table" ||
    message === "You can buy more chips once you have none left"
  ) {
    reportError({ area: "validation", tableId, route, kind });
    return;
  }
  if (message === "Table is busy") {
    logError(tableId, route, error);
    reportError({ area: "store", tableId, op: "lock", kind });
    return;
  }
  if (error instanceof EngineTimeout || message === "Poker engine failed" || /fetch failed|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
    logError(tableId, route, error);
    reportError({ area: "store", tableId, op: "engine", kind });
    return;
  }
  logError(tableId, route, error);
  reportError({ area: "action", tableId, route, kind });
}
