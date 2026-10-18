export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shulchan.win";

async function post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

const pendingCodes = new Map<string, Promise<{ token: string; email: string }>>();

/** The redirect carries a one-time code. Two screens can redeem the same code; only one request is sent. */
export function redeemHostCode(code: string) {
  const existing = pendingCodes.get(code);
  if (existing) return existing;
  const pending = post<{ token: string; email: string }>("/auth/session", { code }).finally(() => {
    pendingCodes.delete(code);
  });
  pendingCodes.set(code, pending);
  return pending;
}

export function createTable(smallBlind: number, buyIn: number, hostToken: string) {
  return post<{ gameId: string; adminSecret: string; password: string }>("/api/games", { smallBlind, buyIn }, {
    authorization: `Bearer ${hostToken}`,
  });
}

export function joinTable(gameId: string, name: string, password: string, adminSecret?: string) {
  return post<{ id: string; secret: string }>(`/api/games/${gameId}/join`, { name, password, adminSecret });
}

/** True when this server still has the table. A failed request leaves the seat alone. */
export async function tableExists(gameId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/games/${encodeURIComponent(gameId)}`);
    if (response.status === 404) return false;
    return true;
  } catch {
    return true;
  }
}

export function liveKitToken(gameId: string, playerId: string, secret: string) {
  return post<{ token: string; url: string }>(`/api/games/${gameId}/livekit`, { playerId, secret });
}
