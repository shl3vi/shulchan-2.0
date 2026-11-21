import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, createTable, joinTable, tableExists } from "@/game/api";
import { loadSeat, saveSeat } from "@/game/sessionStore";
import type { Credentials, TableSnapshot } from "@/game/types";
import type { GameKind } from "@/games/registry";
import { t } from "@/i18n";

type GameSessionValue = {
  credentials: Credentials | null;
  state: TableSnapshot | null;
  error: string | null;
  /** The server's code for the error, when it sent one. Screens translate by code. */
  errorCode: string | null;
  dismissError: () => void;
  /** Opens a table of this game with the settings its opening form chose, and sits down as admin. */
  createAndSit: (name: string, hostToken: string, kind: GameKind, settings: object) => Promise<void>;
  join: (name: string, gameId: string, password: string) => Promise<void>;
  ready: boolean;
  leave: () => Promise<void>;
  removePlayer: (playerId: string) => void;
  transferAdmin: (playerId: string) => void;
  setPaused: (paused: boolean) => void;
  /** Sends a game's move. Each game's folder knows its own events. */
  emit: (event: string, body?: unknown) => void;
  subscribe: (event: string, handler: (body: unknown) => void) => () => void;
};

const GameSessionContext = createContext<GameSessionValue | null>(null);

export function GameSessionProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [state, setState] = useState<TableSnapshot | null>(null);
  const [error, setErrorText] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  function setError(message: string | null, code: string | null = null) {
    setErrorText(message);
    setErrorCode(code);
  }
  const [socket, setSocket] = useState<Socket | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadSeat().then(async (saved) => {
      if (!live) return;
      if (saved && !(await tableExists(saved.gameId, saved.playerId, saved.playerSecret))) {
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
    next.on("closed", (payload: { reason?: string }) => {
      remember(null);
      setState(null);
      setError(payload?.reason === "idle" ? t("tableClosedIdle") : t("leftTable"));
    });
    next.on("error", (payload: { message?: string; code?: string }) => {
      if (payload.message === "Invalid connection") {
        remember(null);
        setState(null);
        setError(null);
        return;
      }
      setError(payload.message ?? "Table error", payload.code ?? null);
    });
    // The socket is an outside connection made here, and the session hands it out once it exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      errorCode,
      dismissError() {
        setError(null);
      },
      ready,
      async createAndSit(name, hostToken, kind, settings) {
        if (credentials) throw new Error(t("alreadyAtTable"));
        const table = await createTable(hostToken, kind, settings);
        const player = await joinTable(table.gameId, name, table.password, table.adminSecret);
        remember({
          gameId: table.gameId,
          playerId: player.id,
          playerSecret: player.secret,
        });
      },
      async join(name, gameId, password) {
        if (credentials) return;
        const player = await joinTable(gameId.trim(), name, password);
        remember({
          gameId: gameId.trim(),
          playerId: player.id,
          playerSecret: player.secret,
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
      setPaused(paused) {
        if (!state?.you?.isAdmin) return;
        socket?.emit("pause", { paused });
      },
      emit(event, body) {
        if (body === undefined) socket?.emit(event);
        else socket?.emit(event, body);
      },
      subscribe(event, handler) {
        if (!socket) return () => {};
        socket.on(event, handler);
        return () => {
          socket.off(event, handler);
        };
      },
    }),
    [credentials, error, errorCode, ready, socket, state],
  );

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
  const value = useContext(GameSessionContext);
  if (!value) throw new Error("useGameSession must be used inside GameSessionProvider");
  return value;
}
