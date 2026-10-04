import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, createTable, joinTable } from "@/game/api";
import { loadSeat, saveSeat } from "@/game/sessionStore";
import type { Credentials, TableSnapshot } from "@/game/types";
import { t } from "@/i18n";

type GameSessionValue = {
  credentials: Credentials | null;
  state: TableSnapshot | null;
  error: string | null;
  createAndSit: (name: string, smallBlind: number, buyIn: number) => Promise<void>;
  join: (name: string, gameId: string, password: string) => Promise<void>;
  ready: boolean;
  leave: () => Promise<void>;
  removePlayer: (playerId: string) => void;
  startHand: () => void;
  act: (action: string, amount?: number) => void;
};

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [state, setState] = useState<TableSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSeat().then((saved) => {
      setCredentials((current) => current ?? saved);
      setReady(true);
    });
  }, []);

  function remember(next: Credentials | null) {
    setCredentials(next);
    void saveSeat(next);
  }

  useEffect(() => {
    if (!credentials) return;
    const next = io(`${API_URL}/table`, {
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
    next.on("kicked", () => {
      remember(null);
      setState(null);
      setError(t("leftTable"));
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
      ready,
      async createAndSit(name, smallBlind, buyIn) {
        if (credentials) throw new Error(t("alreadyAtTable"));
        const table = await createTable(smallBlind, buyIn);
        const player = await joinTable(table.gameId, name, table.password);
        remember({
          gameId: table.gameId,
          playerId: player.id,
          playerSecret: player.secret,
          adminSecret: table.adminSecret,
          password: table.password,
        });
      },
      async join(name, gameId, password) {
        if (credentials) return;
        const player = await joinTable(gameId.trim(), name, password);
        remember({
          gameId: gameId.trim(),
          playerId: player.id,
          playerSecret: player.secret,
          adminSecret: null,
          password,
        });
      },
      async leave() {
        socket?.emit("leave");
        remember(null);
        setState(null);
        setError(null);
      },
      removePlayer(playerId) {
        if (!credentials?.adminSecret) return;
        socket?.emit("remove-player", { adminSecret: credentials.adminSecret, playerId });
      },
      startHand() {
        if (!credentials?.adminSecret) return;
        socket?.emit("start-hand", { adminSecret: credentials.adminSecret });
      },
      act(action, amount) {
        socket?.emit("act", { action, amount });
      },
    }),
    [credentials, error, ready, socket, state],
  );

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
  const value = useContext(GameSessionContext);
  if (!value) throw new Error("useGameSession must be used inside GameSessionProvider");
  return value;
}
