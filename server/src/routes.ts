import { Router } from "express";
import { createGame, getGame } from "./game.js";

export const router = Router();

router.post("/", (req, res) => {
  const smallBlind = Number(req.body?.smallBlind);
  const buyIn = Number(req.body?.buyIn);
  if (!Number.isInteger(smallBlind) || smallBlind < 1) {
    res.status(400).json({ error: "smallBlind must be a positive integer" });
    return;
  }
  if (!Number.isInteger(buyIn) || buyIn < smallBlind * 2) {
    res.status(400).json({ error: "buyIn must be at least two big blinds" });
    return;
  }
  const game = createGame(smallBlind, buyIn);
  res.status(201).json({
    gameId: game.id,
    adminSecret: game.adminSecret,
    state: game.snapshot(),
  });
});

router.post("/:id/join", (req, res) => {
  const game = getGame(String(req.params.id));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  try {
    const player = game.join(String(req.body?.name ?? ""));
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Join failed" });
  }
});

router.get("/:id", (req, res) => {
  const game = getGame(String(req.params.id));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const playerId = typeof req.query.playerId === "string" ? req.query.playerId : undefined;
  res.json(game.snapshot(playerId));
});
