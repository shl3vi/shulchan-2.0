import type { Server, Socket } from "socket.io";
import { actPoker, readPoker, startPoker, type ActionName } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { publishTable, readTable, subscriber } from "./store.js";

const actions = new Set<ActionName>(["fold", "check", "call", "bet", "raise"]);

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

    socket.on("start-hand", async (body: { adminSecret?: string }) => {
      if (String(body?.adminSecret ?? "") !== table.adminSecret) {
        socket.emit("error", { message: "Not the table admin" });
        return;
      }
      try {
        await startPoker(tableId);
        await publishTable(tableId);
      } catch (error) {
        socket.emit("error", { message: error instanceof Error ? error.message : "Cannot start" });
      }
    });

    socket.on("act", async (body: { action?: ActionName; amount?: number }) => {
      const action = body?.action;
      if (!action || !actions.has(action)) {
        socket.emit("error", { message: "Unknown action" });
        return;
      }
      try {
        await actPoker(tableId, player.seat, action, body.amount);
        await publishTable(tableId);
      } catch (error) {
        socket.emit("error", { message: error instanceof Error ? error.message : "Action failed" });
      }
    });
  });
}
