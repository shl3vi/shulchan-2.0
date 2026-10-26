import type { Server, Socket } from "socket.io";
import { actPoker, addChips, readPoker, startPoker } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { noteBackgammon, notePlayers, notePoker } from "./events/ledger.js";
import { reportCaught, reportError } from "./events/report.js";
import { assignAdmin, dropRemovedPlayers, releaseSeat, seatedCount, tablePassword } from "./players.js";
import { noteBackgammonWin, playBackgammon } from "./backgammon.js";
import { debugConfig } from "./debug.js";
import { allowSocketEvent } from "./http.js";
import { removeFromRoom } from "./livekit.js";
import { actBody, backgammonBody, MAX_CHIPS, playerBody, readSchema, rebuyBody } from "./schema.js";
import { publishTable, readTable, subscriber, withTable, type TableRecord } from "./store.js";

async function broadcast(io: Server, tableId: string) {
  const table = await readTable(tableId);
  if (!table) return;
  const view = await readPoker(tableId);
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
    socket.emit("state", snapshot(table, view, viewer));
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
    const player = table?.players.find((seat) => seat.id === playerId && seat.secret === playerSecret);
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
    const kind = table.kind ?? "poker";

    socket.join(tableId);
    socket.emit("state", snapshot(table, await readPoker(tableId), playerId));

    async function change<T>(fallback: string, run: (current: TableRecord) => Promise<T>) {
      try {
        const result = await withTable(tableId, run);
        await publishTable(tableId);
        return result;
      } catch (error) {
        reportCaught(tableId, error, "socket", kind);
        socket.emit("error", { message: error instanceof Error ? error.message : fallback });
        return undefined;
      }
    }

    async function resync() {
      const current = await readTable(tableId);
      if (current) socket.emit("state", snapshot(current, await readPoker(tableId), playerId));
    }

    function requireAdmin(current: TableRecord) {
      if (player!.id !== current.adminId) throw new Error("Not the table admin");
    }

    const onEvent = (event: string, handler: (body: unknown) => void) => {
      socket.on(event, (body: unknown) => {
        void allowSocketEvent(player.id).then((allowed) => {
          if (!allowed) {
            socket.emit("error", { message: "Too many requests" });
            return;
          }
          handler(body);
        }).catch((error) => {
          reportCaught(tableId, error, event, kind);
          handler(body);
        });
      });
    };

    function betAmount(action: string, amount: number | undefined) {
      if (action !== "bet" && action !== "raise") return true;
      return amount != null && Number.isInteger(amount) && amount >= 1 && amount <= MAX_CHIPS;
    }

    onEvent("start-hand", () => {
      void change("Cannot start", async (current) => {
        requireAdmin(current);
        const view = await startPoker(tableId);
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
        await releaseSeat(current, player.id);
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
        if (!next || next.id === player.id) throw new Error("Player not found");
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
      return change("Buy-in failed", async (current) => {
        if (!Number.isInteger(amount) || amount < 1 || amount > current.buyIn) {
          throw new Error("Buy-in must be a whole number up to the table buy-in");
        }
        const seated = current.players.find((seat) => seat.id === player.id);
        if (!seated) throw new Error("Player not found");
        await addChips(tableId, player.seat, amount);
        seated.bought = (seated.bought ?? current.buyIn) + amount;
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
        const game = (await playBackgammon(current, player.id, action)) as { phase?: unknown; turn?: unknown };
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
      return change("Action failed", async (current) => {
        const view = await actPoker(tableId, player.seat, parsed.action, parsed.amount);
        await dropRemovedPlayers(current);
        return { round: view.round, seated: seatedCount(current) };
      }).then(async (mark) => {
        if (!mark) return;
        await notePoker(tableId, mark.round);
        await notePlayers(tableId, mark.seated);
      });
    });
  });
}
