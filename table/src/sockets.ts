import type { Server, Socket } from "socket.io";
import { notePlayers } from "./events/ledger.js";
import { reportCaught, reportError } from "./events/report.js";
import { gameFor, gameOf, kindOf } from "./games/index.js";
import type { GameMove } from "./games/types.js";
import { assignAdmin, releaseSeat, sameSecret, seatedCount, tablePassword } from "./players.js";
import { isDebugTable } from "./debug.js";
import { allowSocketEvent } from "./http.js";
import { endRoom, mediaRoom, mediaRooms, removeFromRoom } from "./livekit.js";
import { setPaused } from "./idle.js";
import { pauseBody, playerBody, readSchema } from "./schema.js";
import { blockedSeatIds } from "./safety.js";
import { publishTable, readTable, subscriber, TABLE_UNCHANGED, withTable, type SeatPlayer, type TableRecord } from "./store.js";

class LeftTable extends Error {
  constructor() {
    super("You are no longer at this table");
  }
}

async function personal(table: TableRecord, viewerId: string) {
  const viewer = table.players.find((player) => player.id === viewerId);
  const blocked = await blockedSeatIds(viewer?.personKey, table.players).catch(() => new Set<string>());
  return gameOf(table).snapshot(table, viewerId, blocked);
}

async function broadcast(io: Server, tableId: string) {
  const table = await readTable(tableId);
  if (!table) return;
  gameOf(table).arm?.(table);
  const room = io.of("/table").adapter.rooms.get(tableId);
  if (!room) return;
  for (const socketId of room) {
    const socket = io.of("/table").sockets.get(socketId);
    if (!socket) continue;
    const viewer = String(socket.handshake.auth.playerId ?? "");
    if (!table.players.some((player) => player.id === viewer)) {
      socket.emit("kicked");
      socket.disconnect(true);
      continue;
    }
    socket.emit("state", await personal(table, viewer));
  }
}

export function attachSockets(io: Server) {
  const nsp = io.of("/table");

  subscriber.subscribe("tables", (tableId) => {
    void broadcast(io, tableId);
  });

  nsp.on("connection", async (socket: Socket) => {
    const tableId = String(socket.handshake.auth.gameId ?? "");
    const playerId = String(socket.handshake.auth.playerId ?? "");
    const playerSecret = String(socket.handshake.auth.playerSecret ?? "");
    const table = await readTable(tableId);
    const player = table?.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(playerSecret, seat.secret));
    if (!table || !player) {
      reportError({
        area: "auth",
        route: "socket",
        ...(table ? { tableId, kind: kindOf(table) } : {}),
      });
      socket.emit("error", { message: "Invalid connection" });
      socket.disconnect(true);
      return;
    }
    const connected = player;
    const kind = kindOf(table);
    const game = gameFor(kind);

    socket.join(tableId);
    socket.emit("state", await personal(table, playerId));

    async function change<T>(fallback: string, run: (current: TableRecord, seat: SeatPlayer) => Promise<T>) {
      try {
        const result = await withTable(tableId, async (current) => {
          const seat = current.players.find((entry) => entry.id === connected.id && !entry.pendingRemoval);
          if (!seat) throw new LeftTable();
          return run(current, seat);
        });
        if (result === TABLE_UNCHANGED) return undefined;
        await publishTable(tableId);
        game.changed?.(tableId);
        return result;
      } catch (error) {
        if (error instanceof LeftTable) {
          socket.emit("kicked");
          socket.disconnect(true);
          return undefined;
        }
        reportCaught(tableId, error, "socket", kind);
        socket.emit("error", { message: error instanceof Error ? error.message : fallback });
        return undefined;
      }
    }

    async function resync() {
      const current = await readTable(tableId);
      if (current) socket.emit("state", await personal(current, playerId));
    }

    function requireAdmin(current: TableRecord) {
      if (connected.id !== current.adminId) throw new Error("Not the table admin");
    }

    const onEvent = (event: string, handler: (body: unknown) => void) => {
      socket.on(event, (body: unknown) => {
        void allowSocketEvent(connected.id).then((allowed) => {
          if (!allowed) {
            socket.emit("error", { message: "Too many requests" });
            return;
          }
          handler(body);
        }).catch((error) => {
          reportCaught(tableId, error, event, kind);
          socket.emit("error", { message: "Too many requests" });
        });
      });
    };

    onEvent("pause", (body: unknown) => {
      const parsed = readSchema(pauseBody, body);
      if (!parsed) {
        reportError({ area: "validation", route: "pause", tableId, kind });
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      return change("Cannot pause the table", async (current) => {
        requireAdmin(current);
        if (Boolean(current.paused) === parsed.paused) return TABLE_UNCHANGED;
        if (!parsed.paused) {
          setPaused(current, false, Date.now());
          gameOf(current).resume?.(current, Date.now());
          return null;
        }
        setPaused(current, true, Date.now());
        const previous = current.mediaEpoch ?? 0;
        current.mediaEpoch = previous + 1;
        return previous;
      }).then(async (previous) => {
        if (typeof previous !== "number") return;
        await endRoom(mediaRoom(tableId, previous)).catch((error: unknown) => {
          reportCaught(tableId, error, "livekit-silence", kind);
        });
      });
    });

    onEvent("leave", () => {
      void change("Cannot leave", async (current) => {
        await releaseSeat(current, connected.id);
        return seatedCount(current);
      }).then(async (seated) => {
        if (seated === undefined) return;
        await notePlayers(tableId, seated);
      });
    });

    onEvent("transfer-admin", (body: unknown) => {
      const parsed = readSchema(playerBody, body);
      if (!parsed) {
        reportError({ area: "validation", route: "transfer-admin", tableId, kind });
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      return change("Cannot transfer admin", async (current) => {
        requireAdmin(current);
        const next = current.players.find((seat) => seat.id === parsed.playerId && !seat.pendingRemoval);
        if (!next || next.id === connected.id) throw new Error("Player not found");
        if (next.web) throw new Error("A player in the browser cannot be admin");
        assignAdmin(current, next.id);
      });
    });

    onEvent("remove-player", (body: unknown) => {
      const parsed = readSchema(playerBody, body);
      if (!parsed) {
        reportError({ area: "validation", route: "remove-player", tableId, kind });
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      return change("Cannot remove player", async (current) => {
        requireAdmin(current);
        await releaseSeat(current, parsed.playerId);
        // The removed player still knows the old password, so it must not let them back in.
        if (!isDebugTable(tableId)) current.password = tablePassword();
        return { seated: seatedCount(current), epoch: current.mediaEpoch };
      }).then(async (result) => {
        if (result === undefined) return;
        await notePlayers(tableId, result.seated);
        // After a pause the video room is `tableId:epoch`. Drop them from the current
        // room, the bare table room and the previous epoch, in case a pause is mid-flight.
        for (const room of mediaRooms(tableId, result.epoch, true)) {
          await removeFromRoom(room, parsed.playerId).catch((error: unknown) => {
            reportCaught(tableId, error, "livekit-remove", kind);
          });
        }
      });
    });

    function onMove(event: string, move: GameMove) {
      onEvent(event, (body: unknown) => {
        const parsed = move.schema.safeParse(body);
        const problem = parsed.success ? (move.check?.(parsed.data) ?? null) : (move.invalidMessage ?? "Invalid request");
        if (!parsed.success || problem) {
          reportError({ area: "validation", route: event, tableId, kind });
          socket.emit("error", { message: problem });
          return;
        }
        void change(move.failure, async (current, seat) => {
          if (kindOf(current) !== kind) throw new Error(`This table is not ${kind}`);
          return move.run({
            table: current,
            seat,
            requireAdmin: () => requireAdmin(current),
          }, parsed.data);
        }).then(async (result) => {
          await move.after?.({ tableId, resync }, result);
        }).catch((error) => {
          reportCaught(tableId, error, event, kind);
        });
      });
    }

    for (const [event, move] of Object.entries(game.moves)) onMove(event, move);
  });
}
