import { captureCrash } from "./posthog.js";

let crashing = false;

/**
 * Node already exits on an error nobody caught. This prints the stack to the Railway log and sends one
 * `server.crash` event first, then exits so Railway restarts the service.
 */
async function crash(source: string, error: unknown) {
  if (crashing) return;
  crashing = true;
  console.error(`crash (${source}):`, error instanceof Error ? (error.stack ?? error.message) : error);
  await Promise.race([captureCrash(source).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 2000))]);
  process.exit(1);
}

export function installCrashHandlers() {
  process.on("uncaughtException", (error) => void crash("uncaughtException", error));
  process.on("unhandledRejection", (reason) => void crash("unhandledRejection", reason));
}
