import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, createTable, joinTable } from "@/game/api";
import type { Credentials, TableSnapshot } from "@/game/types";

type GameSessionValue = {
  credentials: Credentials | null;
  state: TableSnapshot | null;
  error: string | null;
  createAndSit: (name: string, smallBlind: number, buyIn: number) => Promise<void>;
  join: (name: string, gameId: string) => Promise<void>;
  startHand: () => void;
  act: (action: string, amount?: number) => void;
};

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [state, setState] = useState<TableSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!credentials) return;
    const next = io(`${API_URL}/poker`, {
      auth: {
        gameId: credentials.gameId,
        playerId: credentials.playerId,
        playerSecret: credentials.playerSecret,
      },
      transports: ["websocket"],
    });
    next.on("state", (snapshot: TableSnapshot) => {
      setState(snapshot);
      setError(null);
    });
    next.on("error", (payload: { message?: string }) => {
      setError(payload.message ?? "Table error");
    });
    setSocket(next);
    return () => {
      next.close();
      setSocket(null);
    };
  }, [credentials]);

  const value = useMemo<GameSessionValue>(
    () => ({
      credentials,
      state,
      error,
      async createAndSit(name, smallBlind, buyIn) {
        const table = await createTable(smallBlind, buyIn);
        const player = await joinTable(table.gameId, name);
        setCredentials({
          gameId: table.gameId,
          playerId: player.id,
          playerSecret: player.secret,
          adminSecret: table.adminSecret,
        });
      },
      async join(name, gameId) {
        const player = await joinTable(gameId.trim(), name);
        setCredentials({
          gameId: gameId.trim(),
          playerId: player.id,
          playerSecret: player.secret,
          adminSecret: null,
        });
      },
      startHand() {
        if (!credentials?.adminSecret) return;
        socket?.emit("start-hand", { adminSecret: credentials.adminSecret });
      },
      act(action, amount) {
        socket?.emit("act", { action, amount });
      },
    }),
    [credentials, error, socket, state],
  );

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
  const value = useContext(GameSessionContext);
  if (!value) throw new Error("useGameSession must be used inside GameSessionProvider");
  return value;
}
