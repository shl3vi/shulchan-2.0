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

export function reportCaught(tableId: string | undefined, error: unknown, route: string, kind?: "poker" | "backgammon") {
  if (error instanceof TableNotFound) return;
  const message = error instanceof Error ? error.message : "";
  if (message === "Not the table admin" || message === "This table is not backgammon") {
    reportError({ area: "forbidden", tableId, route, kind });
    return;
  }
  if (message.startsWith("Buy-in")) {
    reportError({ area: "validation", tableId, route, kind });
    return;
  }
  if (message === "Table is busy") {
    reportError({ area: "store", tableId, op: "lock", kind });
    return;
  }
  if (message === "Poker engine failed" || /fetch failed|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
    reportError({ area: "store", tableId, op: "engine", kind });
    return;
  }
  reportError({ area: "action", tableId, route, kind });
}
