import { whenTablesExpire } from "../store.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { summarizeExpired } from "./ledger.js";
import { listenPosthog, shutdownPosthog } from "./posthog.js";

export function installAnalytics() {
  listenPosthog();
  whenTablesExpire(summarizeExpired);
}

export function startAnalytics() {
  startHeartbeat();
}

export async function stopAnalytics() {
  stopHeartbeat();
  await Promise.race([
    shutdownPosthog(),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}
