import { timingSafeEqual } from "node:crypto";
import express from "express";
import { apply, IllegalAction, newGame, type Action, type Color, type Game } from "./rules.js";

const engineToken = process.env.ENGINE_TOKEN;
if (!engineToken) throw new Error("ENGINE_TOKEN is required");
const expectedToken = Buffer.from(engineToken);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, game: "backgammon" });
});

app.use((req, res, next) => {
  const given = Buffer.from(req.get("x-engine-token") ?? "");
  if (given.length !== expectedToken.length || !timingSafeEqual(given, expectedToken)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.post("/games", (_req, res) => {
  res.status(201).json(newGame());
});

app.post("/apply", (req, res) => {
  const game = req.body?.game as Game | undefined;
  const color = req.body?.color as Color;
  const action = req.body?.action as Action | undefined;
  if (!game || (color !== "white" && color !== "black") || !action) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    res.json(apply(game, color, action));
  } catch (error) {
    if (!(error instanceof IllegalAction)) throw error;
    res.status(400).json({ error: error.message });
  }
});

const port = Number(process.env.PORT ?? 4002);
app.listen(port, "127.0.0.1", () => {
  console.log(`Backgammon engine listening on http://localhost:${port}`);
});
