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
  /** The server's code for the error. Null for a message the app wrote itself, already translated. */
  errorCode: string | null;
  dismissError: () => void;
  /**
   * Seated, and the table connection has been down for a moment. The app shows that the server is down
   * and takes no action until it is back. A blip shorter than SERVER_DOWN_AFTER_MS shows nothing.
   */
  serverDown: boolean;
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

/** A deploy drops the connection for a second or two. Only a longer gap is shown as the server being down. */
const SERVER_DOWN_AFTER_MS = 2000;

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
  const [online, setOnline] = useState(true);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    if (online || !socket) {
      // The notice goes away the moment the connection is back.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerDown(false);
      return;
    }
    const timer = setTimeout(() => setServerDown(true), SERVER_DOWN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [online, socket]);

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
    next.on("connect", () => setOnline(true));
    next.on("disconnect", () => {
      setOnline(false);
      // Nothing tapped while the connection was down may reach the table late.
      next.sendBuffer = [];
    });
    next.on("connect_error", () => setOnline(false));
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
      setError(
        payload?.reason === "idle" ? t("tableClosedIdle") : payload?.reason === "paused" ? t("tableClosedPaused") : t("leftTable"),
      );
    });
    next.on("error", (payload: { message?: string; code?: string }) => {
      // The seat is gone: the table closed or the player was removed while away.
      if (payload.code === "not-seated") {
        remember(null);
        setState(null);
        setError(null);
        return;
      }
      // Screens show the translation of the code. The English text is kept only for debugging.
      setError(payload.message ?? "Table error", payload.code ?? "failed");
    });
    // The socket is an outside connection made here, and the session hands it out once it exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(next);
    return () => {
      next.close();
      setSocket(null);
      setOnline(true);
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
      serverDown,
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
        // Leaving needs the table to hear it, or the seat would stay taken there.
        if (!socket?.connected) return;
        socket.emit("leave");
        remember(null);
        setState(null);
        setError(null);
      },
      removePlayer(playerId) {
        if (!state?.you?.isAdmin || !socket?.connected) return;
        socket.emit("remove-player", { playerId });
      },
      transferAdmin(playerId) {
        if (!state?.you?.isAdmin || !socket?.connected) return;
        socket.emit("transfer-admin", { playerId });
      },
      setPaused(paused) {
        if (!state?.you?.isAdmin || !socket?.connected) return;
        socket.emit("pause", { paused });
      },
      // Dropped while the connection is down, so a tap can never arrive after the table moved on.
      emit(event, body) {
        if (!socket?.connected) return;
        if (body === undefined) socket.emit(event);
        else socket.emit(event, body);
      },
      subscribe(event, handler) {
        if (!socket) return () => {};
        socket.on(event, handler);
        return () => {
          socket.off(event, handler);
        };
      },
    }),
    [credentials, error, errorCode, ready, serverDown, socket, state],
  );

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
  const value = useContext(GameSessionContext);
  if (!value) throw new Error("useGameSession must be used inside GameSessionProvider");
  return value;
}
