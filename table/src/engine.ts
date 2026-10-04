const engineUrl = process.env.POKER_ENGINE_URL ?? "http://127.0.0.1:4001";

export type Card = { rank: string; suit: string };
export type ActionName = "fold" | "check" | "call" | "bet" | "raise";

export type EngineView = {
  communityCards: Card[];
  pots: { size: number; eligiblePlayers: number[] }[];
  round: "preflop" | "flop" | "turn" | "river" | null;
  playerToActSeat: number | null;
  seats: { seat: number; stack: number; betSize: number; inHand: boolean }[];
  holeCards: { seat: number; cards: Card[] }[];
  legalActions: ActionName[];
  chipRange: { min: number; max: number } | null;
  lastWinners: { seat: number; amount: number }[];
  shownCards: { seat: number; cards: Card[] }[];
};

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${engineUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Poker engine failed");
  return payload;
}

export function createPokerTable(tableId: string, smallBlind: number) {
  return post<EngineView>("/tables", { tableId, smallBlind });
}

export function seatPoker(tableId: string, seat: number, stack: number) {
  return post<EngineView>(`/tables/${tableId}/seat`, { seat, stack });
}

export function unseatPoker(tableId: string, seat: number) {
  return post<EngineView>(`/tables/${tableId}/unseat`, { seat });
}

export function startPoker(tableId: string) {
  return post<EngineView>(`/tables/${tableId}/start`);
}

export function actPoker(tableId: string, seat: number, action: ActionName, amount?: number) {
  return post<EngineView>(`/tables/${tableId}/act`, { seat, action, amount });
}

export async function readPoker(tableId: string): Promise<EngineView> {
  const response = await fetch(`${engineUrl}/tables/${tableId}`);
  const payload = (await response.json()) as EngineView & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Poker engine failed");
  return payload;
}
