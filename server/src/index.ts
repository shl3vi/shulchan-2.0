import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { router } from "./routes.js";
import { attachSockets } from "./sockets.js";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/games", router);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
attachSockets(io);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Shulchan server listening on http://localhost:${port}`);
});
