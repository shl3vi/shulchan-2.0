import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, createTable, joinTable, tableExists } from "@/game/api";
import { loadSeat, saveSeat } from "@/game/sessionStore";
import type { Credentials, TableSnapshot } from "@/game/types";
import { t } from "@/i18n";

type GameSessionValue = {
  credentials: Credentials | null;
  state: TableSnapshot | null;
  error: string | null;
  dismissError: () => void;
  createAndSit: (name: string, smallBlind: number, buyIn: number, hostToken: string) => Promise<void>;
  join: (name: string, gameId: string, password: string) => Promise<void>;
  ready: boolean;
  leave: () => Promise<void>;
  removePlayer: (playerId: string) => void;
  transferAdmin: (playerId: string) => void;
  startHand: () => void;
  act: (action: string, amount?: number) => void;
  rebuy: (amount: number) => void;
};

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [state, setState] = useState<TableSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadSeat().then(async (saved) => {
      if (!live) return;
      if (saved && !(await tableExists(saved.gameId))) {
        if (!live) return;
        setCredentials((current) => {
          if (current) return current;
          void saveSeat(null);
          return null;
        });
        setReady(true);
        return;
      }
      if (!live) return;
      setCredentials((current) => current ?? saved);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  function remember(next: Credentials | null) {
    setCredentials(next);
    void saveSeat(next);
  }

  const gameId = credentials?.gameId;
  const playerId = credentials?.playerId;
  const playerSecret = credentials?.playerSecret;

  useEffect(() => {
    if (!gameId || !playerId || !playerSecret) return;
    const next = io(`${API_URL}/table`, {
      auth: { gameId, playerId, playerSecret },
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
      if (payload.message === "Invalid connection") {
        remember(null);
        setState(null);
        setError(null);
        return;
      }
      setError(payload.message ?? "Table error");
    });
    setSocket(next);
    return () => {
      next.close();
      setSocket(null);
    };
  }, [gameId, playerId, playerSecret]);

  const value = useMemo<GameSessionValue>(
    () => ({
      credentials,
      state,
      error,
      dismissError() {
        setError(null);
      },
      ready,
      async createAndSit(name, smallBlind, buyIn, hostToken) {
        if (credentials) throw new Error(t("alreadyAtTable"));
        const table = await createTable(smallBlind, buyIn, hostToken);
        const player = await joinTable(table.gameId, name, table.password, table.adminSecret);
        remember({
          gameId: table.gameId,
          playerId: player.id,
          playerSecret: player.secret,
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
        if (!state?.you?.isAdmin) return;
        socket?.emit("remove-player", { playerId });
      },
      transferAdmin(playerId) {
        if (!state?.you?.isAdmin) return;
        socket?.emit("transfer-admin", { playerId });
      },
      startHand() {
        if (!state?.you?.isAdmin) return;
        socket?.emit("start-hand");
      },
      act(action, amount) {
        socket?.emit("act", { action, amount });
      },
      rebuy(amount) {
        socket?.emit("rebuy", { amount });
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
