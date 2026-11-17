import { subscribe, type AppEvent, type ErrorArea } from "./bus.js";

/** Mistakes by players (wrong token, bad input, not the admin). They are counted apart from real errors. */
const PLAYER_AREAS = new Set<string>(["auth", "validation", "forbidden"]);

let counts: Record<string, number> = {};

export function countError(event: AppEvent) {
  if (event.name !== "error") return;
  const area = String(event.data.area ?? "unknown");
  counts[area] = (counts[area] ?? 0) + 1;
}

/**
 * Error totals since the last call, sent with the heartbeat, so PostHog gets one event every five minutes however
 * many errors there were. The full error is in the Railway log.
 */
export function takeErrorCounts() {
  const taken = counts;
  counts = {};
  let errors = 0;
  let playerErrors = 0;
  const byArea: Record<string, number> = {};
  for (const [area, count] of Object.entries(taken)) {
    byArea[`errors_${area}`] = count;
    if (PLAYER_AREAS.has(area)) playerErrors += count;
    else errors += count;
  }
  return { errors, playerErrors, ...byArea };
}

export function listenErrorCount() {
  subscribe("error-count", countError);
}

export type { ErrorArea };
