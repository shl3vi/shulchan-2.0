import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { APP_SCHEME, authRouter } from "./auth.js";
import { debugConfig, debugRouter, ensureDebugTable } from "./debug.js";
import { pool } from "./db.js";
import { enginesReady } from "./engine.js";
import { allowedOrigins, cors, rateLimit } from "./http.js";
import { router } from "./routes.js";
import { attachSockets } from "./sockets.js";
import { installAnalytics, startAnalytics, stopAnalytics } from "./events/install.js";
import { connectRedis, flushTables, redis, stopStore, subscriber } from "./store.js";

installAnalytics();
await connectRedis();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors);
app.use(rateLimit);
app.use(express.json({ limit: "8kb" }));
app.use(authRouter);
async function answers(run: () => Promise<unknown>) {
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

app.get("/health", async (_req, res) => {
  const [redisOk, postgresOk, engines] = await Promise.all([
    answers(() => redis.ping()),
    answers(() => pool.query("SELECT 1")),
    enginesReady(),
  ]);
  const ok = redisOk && postgresOk && engines.poker && engines.backgammon;
  res.status(ok ? 200 : 503).json({ ok, redis: redisOk, postgres: postgresOk, ...engines });
});
app.get("/join", (req, res) => {
  const game = String(req.query.game ?? "");
  const password = String(req.query.password ?? "");
  const query = new URLSearchParams({ game, password }).toString();
  const appUrl = `${APP_SCHEME}://join?${query}`;
  const intentUrl = `intent://join?${query}#Intent;scheme=${APP_SCHEME};package=com.anonymous.shulchan;end`;
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

const debug = debugConfig();
if (debug) {
  app.use("/dev/dashboard", debugRouter(debug));
  await ensureDebugTable(debug);
}

const httpServer = createServer(app);
const origins = allowedOrigins();
const io = new Server(httpServer, { cors: { origin: origins.length > 0 ? origins : false } });
attachSockets(io);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Table service listening on http://localhost:${port}`);
  startAnalytics();
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const closed = new Promise((resolve) => httpServer.close(() => resolve(undefined)));
  io.close();
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 8000))]);
  stopStore();
  await flushTables();
  await stopAnalytics();
  await redis.quit().catch(() => undefined);
  await subscriber.quit().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
