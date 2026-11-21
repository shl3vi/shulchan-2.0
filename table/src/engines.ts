/** The server refuses to start without the token. Checked at startup, not when this file loads, so tests can load it. */
export function engineToken() {
  const token = process.env.ENGINE_TOKEN;
  if (!token) throw new Error("ENGINE_TOKEN is required");
  return token;
}

/**
 * Well under the 5 second table lock. The engines answer in milliseconds, so a call
 * this slow is stuck, and waiting longer would only hold the table for everyone.
 */
export const ENGINE_TIMEOUT_MS = 2000;

export class EngineTimeout extends Error {
  constructor() {
    super("The game server is slow. Try again.");
  }
}

/** The engine could not be reached, or answered with an error and no message. */
export class EngineFailed extends Error {
  constructor(message = "Game engine failed") {
    super(message);
  }
}

/** The engine answered and refused the move, for example "Not your turn". The text is the engine's. */
export class EngineRefused extends Error {}

/** Calls one game engine service. Each game's folder knows its own engine's address and paths. */
export async function enginePost<T>(base: string, path: string, body?: unknown): Promise<T> {
  try {
    // The signal also covers reading the body, so a response that stalls halfway still ends.
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "x-engine-token": engineToken(), "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) throw payload.error ? new EngineRefused(payload.error) : new EngineFailed();
    return payload;
  } catch (error) {
    if (error instanceof EngineRefused || error instanceof EngineFailed) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new EngineTimeout();
    // fetch itself failed: the engine is down or its address does not resolve.
    throw new EngineFailed(error instanceof Error ? error.message : "Game engine failed");
  }
}

/** True when the engine answers its health check. */
export async function engineAnswers(base: string) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}
