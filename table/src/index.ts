import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { APP_SCHEME, assertSafeAuthConfig, authRouter } from "./auth.js";
import { debugConfigs, debugRouter, ensureDebugTable } from "./debug.js";
import { pool } from "./db.js";
import { engineToken } from "./engines.js";
import { allGames } from "./games/index.js";
import { allowedOrigins, cors, rateLimit } from "./http.js";
import { router } from "./routes.js";
import { attachCluster } from "./cluster.js";
import { startIdleWatch, stopIdleWatch } from "./idleWatch.js";
import { attachSockets } from "./sockets.js";
import { installCrashHandlers } from "./events/crash.js";
import { installAnalytics, startAnalytics, stopAnalytics } from "./events/install.js";
import { setNameExtras } from "./name.js";
import { allNameTerms, publicConfigFor, regionOf } from "./publicConfig.js";
import { connectRedis, flushTables, redis, stopStore, subscriber } from "./store.js";

try {
  engineToken();
  assertSafeAuthConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const nameTerms = allNameTerms();
setNameExtras(nameTerms.embedded, nameTerms.words);

installAnalytics();
installCrashHandlers();
await connectRedis();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public");
// Ahead of rateLimit: one page load fetches a dozen images, and they would spend the same budget as the app's API calls.
app.use("/assets", express.static(join(publicDir, "assets"), { maxAge: "1d", fallthrough: false }));
const icons = new Set([
  "apple-touch-icon.png",
  "favicon-96x96.png",
  "favicon.ico",
  "site.webmanifest",
  "web-app-manifest-192x192.png",
  "web-app-manifest-512x512.png",
]);
app.get([...icons].map((name) => `/${name}`), (req, res, next) => {
  res.sendFile(join(publicDir, req.path.slice(1)), { maxAge: "7d" }, (err) => {
    if (err) next(err);
  });
});
// AdMob's crawler checks the developer website for this file before it serves ads in the app.
const appAdsTxt = (process.env.APP_ADS_TXT || "google.com, pub-1060524753529308, DIRECT, f08c47fec0942fa0").replace(/\n?$/, "\n");
app.get("/app-ads.txt", (_req, res) => {
  res.type("text/plain; charset=utf-8").set("Cache-Control", "public, max-age=3600").send(appAdsTxt);
});
// Ahead of rateLimit, like /assets: one page load fetches a dozen script files.
// The web build of the app, for guests who open a table link without the app. It is not in git: `npm run web`
// in client/ writes it to public/play. File names under _expo/static carry a content hash, so they can be cached.
const playDir = join(publicDir, "play");
const webBuild = existsSync(join(playDir, "index.html"));
if (webBuild) {
  app.use("/play/_expo/static", express.static(join(playDir, "_expo/static"), { maxAge: "365d", immutable: true, fallthrough: false }));
  app.use("/play", express.static(playDir, { extensions: ["html"], maxAge: 0, index: "index.html" }));
  app.get(/^\/play(\/.*)?$/, (_req, res) => {
    res.sendFile(join(playDir, "index.html"), { maxAge: 0 });
  });
}
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

function page(file: string) {
  return (_req: Request, res: Response) => {
    res.sendFile(join(publicDir, file));
  };
}
app.get("/", page("index.html"));
app.get("/privacy", page("privacy.html"));
app.get("/terms", page("terms.html"));
app.get("/account", page("account.html"));
app.get("/support", page("support.html"));
/** Each game's engine, by game. */
async function enginesReady() {
  const entries = await Promise.all(allGames().map(async ([kind, game]) => [kind, await game.health()] as const));
  return Object.fromEntries(entries) as Record<string, boolean>;
}

app.get("/health", async (_req, res) => {
  const [redisOk, postgresOk, engines] = await Promise.all([
    answers(() => redis.ping()),
    answers(() => pool.query("SELECT 1")),
    enginesReady(),
  ]);
  // One game's engine being down does not take the tables of the other games down with it.
  const ok = redisOk && postgresOk;
  res.status(ok ? 200 : 503).json({ ok, redis: redisOk, postgres: postgresOk, ...engines });
});
/** This server's own address as the browser sees it, behind Railway's proxy. */
function publicOrigin(req: Request) {
  return `${req.protocol}://${req.get("host") ?? "loochka.com"}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char: string) => {
    const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return escaped[char] ?? char;
  });
}

const JOIN_COPY = {
  en: { title: "Join the table", opening: "Opening the table…", sit: "Sit down", browser: "Play in the browser" },
  he: { title: "הצטרפות לשולחן", opening: "פותחים את השולחן…", sit: "לשבת", browser: "לשחק בדפדפן" },
  es: { title: "Unirse a la mesa", opening: "Abriendo la mesa…", sit: "Sentarse", browser: "Jugar en el navegador" },
  ru: { title: "Сесть за стол", opening: "Открываем стол…", sit: "Сесть", browser: "Играть в браузере" },
  ar: { title: "الانضمام إلى طاولة", opening: "جارٍ فتح الطاولة…", sit: "اجلس", browser: "العب في المتصفح" },
};

function joinLocale(req: Request) {
  const header = req.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const code = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
    if (code && Object.hasOwn(JOIN_COPY, code)) return code as keyof typeof JOIN_COPY;
  }
  return "en" as const;
}

app.get("/join", (req, res) => {
  const game = String(req.query.game ?? "");
  const password = String(req.query.password ?? "");
  const query = new URLSearchParams({ game, password }).toString();
  const appUrl = `${APP_SCHEME}://join?${query}`;
  // The web build serves guests who do not have the app. Without it, the link only tries the app.
  const webUrl = webBuild ? `/play/join?${query}` : "";
  // Chrome on Android opens the fallback itself when the app is not installed.
  const fallback = webUrl ? `S.browser_fallback_url=${encodeURIComponent(new URL(webUrl, publicOrigin(req)).toString())};` : "";
  const intentUrl = `intent://join?${query}#Intent;scheme=${APP_SCHEME};package=com.loochka;${fallback}end`;
  const lang = joinLocale(req);
  const copy = JOIN_COPY[lang];
  const dir = lang === "he" || lang === "ar" ? "rtl" : "ltr";
  const href = escapeHtml(appUrl);
  res.type("html").send(`<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(copy.title)}</title>
<link rel="icon" type="image/png" href="/assets/favicon-96x96.png" sizes="96x96">
<link rel="shortcut icon" href="/assets/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon-kit.png">
<style>
  body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; align-content: center; gap: 0.4rem; padding: max(1.5rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left)); background: #07110d; color: #fafaf9; font-family: -apple-system, "Segoe UI", sans-serif; text-align: center; }
  p { margin: 0; font-size: 1.15rem; line-height: 1.4; }
  a { display: inline-flex; align-items: center; justify-content: center; min-height: 3rem; min-width: 8rem; margin-top: 0.8rem; background: #f6d36b; color: #1c1917; text-decoration: none; font-weight: 800; padding: 0.8rem 1.4rem; border-radius: 999px; }
  a.web { background: transparent; color: #f6d36b; border: 1px solid rgba(246, 211, 107, 0.55); margin-top: 0.2rem; }
</style>
</head>
<body>
<p>${escapeHtml(copy.opening)}</p>
<p><a id="open" href="${href}">${escapeHtml(copy.sit)}</a></p>
${webUrl ? `<p><a class="web" href="${escapeHtml(webUrl)}">${escapeHtml(copy.browser)}</a></p>` : ""}
<script>
  var app = ${JSON.stringify(appUrl)};
  var intent = ${JSON.stringify(intentUrl)};
  var web = ${JSON.stringify(webUrl)};
  var ua = navigator.userAgent;
  var android = /Android/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  var open = document.getElementById("open");
  if (android) open.href = intent;
  if (android) {
    location.replace(intent);
  } else if (ios) {
    // When the app opens, this page goes to the background. If it is still in front, there is no app.
    var timer = web ? setTimeout(function () { if (!document.hidden) location.replace(web); }, 1600) : 0;
    document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); });
    location.replace(app);
  } else if (web) {
    // A computer has no app to open.
    location.replace(web);
  } else {
    location.replace(app);
  }
</script>
</body>
</html>`);
});
app.get("/api/config", (req, res) => {
  res.json(publicConfigFor(regionOf(req.query.region)));
});
app.use("/api/games", router);

for (const debug of debugConfigs()) {
  app.use(`/dev/${debug.debug.path}`, debugRouter(debug));
  await ensureDebugTable(debug);
}

const httpServer = createServer(app);
const origins = allowedOrigins();
const io = new Server(httpServer, {
  cors: { origin: origins.length > 0 ? origins : false },
  // A second replica has no sticky sessions. The app opens a WebSocket and stays on it.
  transports: ["websocket"],
});
const closeCluster = await attachCluster(io);
attachSockets(io);
startIdleWatch(io);

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
  await closeCluster();
  stopIdleWatch();
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
