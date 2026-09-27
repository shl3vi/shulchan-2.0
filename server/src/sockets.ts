import type { Server, Socket } from "socket.io";
import type { Action } from "poker-ts/dist/facade/poker.js";
import { getGame } from "./game.js";

const actions = new Set<Action>(["fold", "check", "call", "bet", "raise"]);

export function attachSockets(io: Server) {
  const nsp = io.of("/poker");

  nsp.on("connection", (socket: Socket) => {
    const gameId = String(socket.handshake.auth.gameId ?? "");
    const playerId = String(socket.handshake.auth.playerId ?? "");
    const playerSecret = String(socket.handshake.auth.playerSecret ?? "");
    const game = getGame(gameId);

    try {
      if (!game) throw new Error("Game not found");
      game.assertPlayer(playerId, playerSecret);
    } catch {
      socket.emit("error", { message: "Invalid connection" });
      socket.disconnect(true);
      return;
    }

    socket.join(gameId);
    game.setOnChange(() => {
      for (const roomSocket of nsp.sockets.values()) {
        if (!roomSocket.rooms.has(gameId)) continue;
        const viewer = String(roomSocket.handshake.auth.playerId ?? "");
        roomSocket.emit("state", game.snapshot(viewer));
      }
    });

    socket.emit("state", game.snapshot(playerId));

    socket.on("start-hand", (body: { adminSecret?: string }) => {
      try {
        game.start(String(body?.adminSecret ?? ""));
        void game.runHand();
      } catch (error) {
        socket.emit("error", { message: error instanceof Error ? error.message : "Cannot start" });
      }
    });

    socket.on("act", (body: { action?: Action; amount?: number }) => {
      const action = body?.action;
      if (!action || !actions.has(action)) {
        socket.emit("error", { message: "Unknown action" });
        return;
      }
      try {
        game.act(playerId, playerSecret, action, body.amount);
      } catch (error) {
        socket.emit("error", { message: error instanceof Error ? error.message : "Action failed" });
      }
    });
  });
}
