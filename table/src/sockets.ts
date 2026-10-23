import type { Server, Socket } from "socket.io";
import { actPoker, addChips, readPoker, startPoker } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { assignAdmin, dropRemovedPlayers, releaseSeat } from "./players.js";
import { noteBackgammonWin, readBackgammon } from "./backgammon.js";
import { actBody, playerBody, readSchema, rebuyBody } from "./schema.js";
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
      socket.emit("error", { message: "Invalid connection" });
      socket.disconnect(true);
      return;
    }

    socket.join(tableId);
    socket.emit("state", snapshot(table, await readPoker(tableId), playerId));

    async function change(fallback: string, run: (current: TableRecord) => Promise<void>) {
      try {
        await withTable(tableId, run);
        await publishTable(tableId);
      } catch (error) {
        socket.emit("error", { message: error instanceof Error ? error.message : fallback });
      }
    }

    function requireAdmin(current: TableRecord) {
      if (player!.id !== current.adminId) throw new Error("Not the table admin");
    }

    socket.on("start-hand", () =>
      change("Cannot start", async (current) => {
        requireAdmin(current);
        await startPoker(tableId);
        await dropRemovedPlayers(current);
      }),
    );

    socket.on("leave", () =>
      change("Cannot leave", async (current) => {
        await releaseSeat(current, player.id);
      }),
    );

    socket.on("transfer-admin", (body: unknown) => {
      const parsed = readSchema(playerBody, body);
      if (!parsed) {
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

    socket.on("remove-player", (body: unknown) => {
      const parsed = readSchema(playerBody, body);
      if (!parsed) {
        socket.emit("error", { message: "Invalid request" });
        return;
      }
      return change("Cannot remove player", async (current) => {
        requireAdmin(current);
        await releaseSeat(current, parsed.playerId);
      });
    });

    socket.on("rebuy", (body: unknown) => {
      const parsed = readSchema(rebuyBody, body);
      if (!parsed) {
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

    socket.on("bg", (body: unknown) => {
      const game = readBackgammon(body);
      if (!game) {
        socket.emit("error", { message: "Invalid backgammon position" });
        return;
      }
      return change("Backgammon move failed", async (current) => {
        if (current.kind !== "backgammon") throw new Error("This table is not backgammon");
        if (current.players.filter((seat) => !seat.pendingRemoval).length < 2) {
          throw new Error("Waiting for a second player");
        }
        noteBackgammonWin(current, game);
        current.backgammon = game;
      });
    });

    socket.on("act", (body: unknown) => {
      const parsed = readSchema(actBody, body);
      if (!parsed) {
        socket.emit("error", { message: "Unknown action" });
        return;
      }
      return change("Action failed", async (current) => {
        await actPoker(tableId, player.seat, parsed.action, parsed.amount);
        await dropRemovedPlayers(current);
      });
    });
  });
}
