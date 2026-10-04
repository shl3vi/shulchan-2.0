import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { router } from "./routes.js";
import { attachSockets } from "./sockets.js";
import { connectRedis } from "./store.js";

await connectRedis();

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/join", (req, res) => {
  const game = String(req.query.game ?? "");
  const password = String(req.query.password ?? "");
  const query = new URLSearchParams({ game, password }).toString();
  const appUrl = `client://join?${query}`;
  const intentUrl = `intent://join?${query}#Intent;scheme=client;package=com.anonymous.shulchan;end`;
  res.type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join the table</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07110d; color: #fafaf9; font-family: sans-serif; }
  a { display: inline-block; margin-top: 16px; background: #f6d36b; color: #1c1917; text-decoration: none; font-weight: 800; padding: 14px 22px; border-radius: 999px; }
</style>
<p>Opening the table…</p>
<p><a id="open" href="${appUrl}">Sit down</a></p>
<script>
  var app = ${JSON.stringify(appUrl)};
  var intent = ${JSON.stringify(intentUrl)};
  var open = document.getElementById("open");
  if (/Android/i.test(navigator.userAgent)) open.href = intent;
  location.replace(/Android/i.test(navigator.userAgent) ? intent : app);
</script>`);
});
app.use("/api/games", router);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
attachSockets(io);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Table service listening on http://localhost:${port}`);
});
