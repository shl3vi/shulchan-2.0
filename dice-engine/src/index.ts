import { timingSafeEqual } from "node:crypto";
import express from "express";
import { apply, IllegalAction, leave, newGame, present, type Action, type Game } from "./rules.js";

const engineToken = process.env.ENGINE_TOKEN;
if (!engineToken) throw new Error("ENGINE_TOKEN is required");
const expectedToken = Buffer.from(engineToken);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, game: "dice" });
});

app.use((req, res, next) => {
  const given = Buffer.from(req.get("x-engine-token") ?? "");
  if (given.length !== expectedToken.length || !timingSafeEqual(given, expectedToken)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

function refuse(res: express.Response, error: unknown) {
  if (!(error instanceof IllegalAction)) throw error;
  res.status(400).json({ error: error.message });
}

function isGame(value: unknown): value is Game {
  return typeof value === "object" && value !== null && Array.isArray((value as Game).players) && Array.isArray((value as Game).dice);
}

app.post("/games", (req, res) => {
  const players = req.body?.players;
  if (!Array.isArray(players) || !players.every((player) => typeof player?.id === "string" && typeof player?.name === "string")) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    res.status(201).json(present(newGame(players)));
  } catch (error) {
    refuse(res, error);
  }
});

app.post("/apply", (req, res) => {
  const game = req.body?.game;
  const playerId = req.body?.playerId;
  const action = req.body?.action as Action | undefined;
  if (!isGame(game) || typeof playerId !== "string" || !action) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    res.json(present(apply(game, playerId, action)));
  } catch (error) {
    refuse(res, error);
  }
});

app.post("/leave", (req, res) => {
  const game = req.body?.game;
  const playerId = req.body?.playerId;
  if (!isGame(game) || typeof playerId !== "string") {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  res.json(present(leave(game, playerId)));
});

const port = Number(process.env.PORT ?? 4003);
app.listen(port, "0.0.0.0", () => {
  console.log(`Dice engine listening on http://0.0.0.0:${port}`);
});
