import type { Server, Socket } from "socket.io";
import { actPoker, addChips, readPoker, startPoker, type ActionName } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { assignAdmin, dropRemovedPlayers, releaseSeat } from "./players.js";
import { publishTable, readTable, subscriber, withTable, type TableRecord } from "./store.js";

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
    if (!table.players.some((player) => player.id === viewer)) {
      socket.emit("kicked");
      return;
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

    function claimAdmin(current: TableRecord, adminSecret: string) {
      if (!current.adminId && adminSecret === current.adminSecret) current.adminId = player!.id;
    }

    function requireAdmin(current: TableRecord, adminSecret: string) {
      claimAdmin(current, adminSecret);
      if (player!.id !== current.adminId || adminSecret !== current.adminSecret) throw new Error("Not the table admin");
    }

    socket.on("start-hand", (body: { adminSecret?: string }) =>
      change("Cannot start", async (current) => {
        requireAdmin(current, String(body?.adminSecret ?? ""));
        await startPoker(tableId);
        await dropRemovedPlayers(current);
      }),
    );

    socket.on("leave", (body: { adminSecret?: string }) =>
      change("Cannot leave", async (current) => {
        claimAdmin(current, String(body?.adminSecret ?? ""));
        await releaseSeat(current, player.id);
      }),
    );

    socket.on("transfer-admin", (body: { adminSecret?: string; playerId?: string }) =>
      change("Cannot transfer admin", async (current) => {
        requireAdmin(current, String(body?.adminSecret ?? ""));
        const next = current.players.find((seat) => seat.id === body?.playerId && !seat.pendingRemoval);
        if (!next || next.id === player.id) throw new Error("Player not found");
        assignAdmin(current, next.id);
      }),
    );

    socket.on("remove-player", (body: { adminSecret?: string; playerId?: string }) =>
      change("Cannot remove player", async (current) => {
        requireAdmin(current, String(body?.adminSecret ?? ""));
        await releaseSeat(current, String(body?.playerId ?? ""));
      }),
    );

    socket.on("rebuy", (body: { amount?: number }) => {
      const amount = Number(body?.amount);
      if (!Number.isInteger(amount) || amount < 1) {
        socket.emit("error", { message: "Buy-in must be a positive whole number" });
        return;
      }
      return change("Buy-in failed", async (current) => {
        const seated = current.players.find((seat) => seat.id === player.id);
        if (!seated) throw new Error("Player not found");
        await addChips(tableId, player.seat, amount);
        seated.bought = (seated.bought ?? current.buyIn) + amount;
      });
    });

    socket.on("act", (body: { action?: ActionName; amount?: number }) => {
      const action = body?.action;
      if (!action || !actions.has(action)) {
        socket.emit("error", { message: "Unknown action" });
        return;
      }
      return change("Action failed", async (current) => {
        await actPoker(tableId, player.seat, action, body.amount);
        await dropRemovedPlayers(current);
      });
    });
  });
}
