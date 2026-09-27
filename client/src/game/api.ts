export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shulchan-server.onrender.com";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export function createTable(smallBlind: number, buyIn: number) {
  return post<{ gameId: string; adminSecret: string }>("/api/games", { smallBlind, buyIn });
}

export function joinTable(gameId: string, name: string) {
  return post<{ id: string; secret: string }>(`/api/games/${gameId}/join`, { name });
}
