import type { Server, Socket } from "socket.io";
import { considerAutoDeal } from "./autodeal.js";
import { actPoker, addChips, readPoker, startPoker } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { noteBackgammon, notePlayers, notePoker } from "./events/ledger.js";
import { reportCaught, reportError } from "./events/report.js";
import { assignAdmin, dropRemovedPlayers, foldDeparted, releaseSeat, sameSecret, seatedCount, tablePassword } from "./players.js";
import { noteBackgammonWin, playBackgammon } from "./backgammon.js";
import { debugConfig } from "./debug.js";
import { allowSocketEvent } from "./http.js";
import { removeFromRoom } from "./livekit.js";
import { actBody, autoDealBody, backgammonBody, MAX_CHIPS, playerBody, readSchema, rebuyBody } from "./schema.js";
import { blockedSeatIds } from "./safety.js";
import { publishTable, readTable, subscriber, withTable, type SeatPlayer, type TableRecord } from "./store.js";

class LeftTable extends Error {
  constructor() {
    super("You are no longer at this table");
  }
}

async function personal(table: TableRecord, viewerId: string) {
  const view = await readPoker(table);
  const viewer = table.players.find((player) => player.id === viewerId);
  const blocked = await blockedSeatIds(viewer?.personKey, table.players).catch(() => new Set<string>());
  return snapshot(table, view, viewerId, blocked);
}

async function broadcast(io: Server, tableId: string) {
  const table = await readTable(tableId);
  if (!table) return;
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
        ...(table ? { tableId, kind: table.kind ?? "poker" } : {}),
      });
      socket.emit("error", { message: "Invalid connection" });
      socket.disconnect(true);
      return;
    }
    const connected = player;
    const kind = table.kind ?? "poker";

    socket.join(tableId);
    socket.emit("state", await personal(table, playerId));

    async function change<T>(fallback: string, run: (current: TableRecord, seat: SeatPlayer) => Promise<T>) {
      try {
        const result = await withTable(tableId, async (current) => {
          const seat = current.players.find((entry) => entry.id === connected.id && !entry.pendingRemoval);
          if (!seat) throw new LeftTable();
          return run(current, seat);
        });
        await publishTable(tableId);
        void considerAutoDeal(tableId);
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

    function betAmount(action: string, amount: number | undefined) {
      if (action !== "bet" && action !== "raise") return true;
      return amount != null && Number.isInteger(amount) && amount >= 1 && amount <= MAX_CHIPS;
    }

    onEvent("auto-deal", (body: unknown) => {
      const parsed = readSchema(autoDealBody, body);
      if (!parsed) {
        reportError({ area: "validation", route: "auto-deal", tableId, kind });
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      return change("Cannot change automatic dealing", async (current) => {
        requireAdmin(current);
        if ((current.kind ?? "poker") === "backgammon") throw new Error("This table is not poker");
        current.autoDeal = parsed.enabled;
      });
    });

    onEvent("start-hand", () => {
      void change("Cannot start", async (current) => {
        requireAdmin(current);
        const view = await startPoker(current);
        await dropRemovedPlayers(current);
        return { round: view.round, seated: seatedCount(current) };
      }).then(async (mark) => {
        if (!mark) return;
        await notePoker(tableId, mark.round);
        await notePlayers(tableId, mark.seated);
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
        if (debugConfig()?.tableId !== tableId) current.password = tablePassword();
        return seatedCount(current);
      }).then(async (seated) => {
        if (seated === undefined) return;
        await notePlayers(tableId, seated);
        await removeFromRoom(tableId, parsed.playerId).catch((error: unknown) => {
          reportCaught(tableId, error, "livekit-remove", kind);
        });
      });
    });

    onEvent("rebuy", (body: unknown) => {
      const parsed = readSchema(rebuyBody, body);
      if (!parsed) {
        reportError({ area: "validation", route: "rebuy", tableId, kind });
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      const amount = parsed.amount;
      return change("Buy-in failed", async (current, seat) => {
        if (!Number.isInteger(amount) || amount < 1 || amount > current.buyIn) {
          throw new Error("Buy-in must be a whole number up to the table buy-in");
        }
        await addChips(current, seat.seat, amount);
        seat.bought = (seat.bought ?? current.buyIn) + amount;
      });
    });

    onEvent("bg", (body: unknown) => {
      const action = readSchema(backgammonBody, body);
      if (!action) {
        reportError({ area: "validation", route: "bg", tableId, kind });
        socket.emit("error", { message: "Invalid backgammon move" });
        return;
      }
      return change("Backgammon move failed", async (current) => {
        if (current.kind !== "backgammon") throw new Error("This table is not backgammon");
        if (seatedCount(current) < 2) {
          throw new Error("Waiting for a second player");
        }
        const previous = current.backgammon as { phase?: unknown; turn?: unknown } | undefined;
        const before = current.backgammonLog?.length ?? 0;
        const game = (await playBackgammon(current, connected.id, action)) as { phase?: unknown; turn?: unknown };
        noteBackgammonWin(current, game);
        current.backgammon = game;
        return { previous: previous ?? null, game, games: (current.backgammonLog?.length ?? 0) - before };
      }).then(async (mark) => {
        // A refused move leaves this phone showing its own guess, so send it the real board.
        if (!mark) {
          await resync();
          return;
        }
        await noteBackgammon(tableId, mark.previous, mark.game, mark.games);
      });
    });

    onEvent("act", (body: unknown) => {
      const parsed = readSchema(actBody, body);
      if (!parsed || !betAmount(parsed.action, parsed.amount)) {
        reportError({ area: "validation", route: "act", tableId, kind });
        socket.emit("error", { message: parsed ? "Bet size is outside the allowed range" : "Unknown action" });
        return;
      }
      return change("Action failed", async (current, seat) => {
        await actPoker(current, seat.seat, parsed.action, parsed.amount);
        await foldDeparted(current);
        await dropRemovedPlayers(current);
        const view = await readPoker(current);
        return { round: view.round, seated: seatedCount(current) };
      }).then(async (mark) => {
        if (!mark) return;
        await notePoker(tableId, mark.round);
        await notePlayers(tableId, mark.seated);
      });
    });
  });
}
