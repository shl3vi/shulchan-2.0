import { Router } from "express";
import { createPokerTable, readPoker, seatPoker } from "./engine.js";
import { snapshot } from "./snapshot.js";
import { publishTable, readTable, writeTable, type TableRecord } from "./store.js";

export const router = Router();
const MAX_SEATS = 9;

router.post("/", async (req, res) => {
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
  const table: TableRecord = {
    id: crypto.randomUUID(),
    adminSecret: crypto.randomUUID(),
    smallBlind,
    buyIn,
    players: [],
  };
  await createPokerTable(table.id, smallBlind);
  await writeTable(table);
  res.status(201).json({
    gameId: table.id,
    adminSecret: table.adminSecret,
    state: snapshot(table, await readPoker(table.id)),
  });
});

router.post("/:id/join", async (req, res) => {
  const table = await readTable(String(req.params.id));
  if (!table) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (table.players.length >= MAX_SEATS) {
    res.status(400).json({ error: "Table is full" });
    return;
  }
  const taken = new Set(table.players.map((player) => player.seat));
  const seat = Array.from({ length: MAX_SEATS }, (_, index) => index).find((index) => !taken.has(index));
  if (seat === undefined) {
    res.status(400).json({ error: "Table is full" });
    return;
  }
  const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), seat };
  try {
    await seatPoker(table.id, seat, table.buyIn);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Join failed" });
    return;
  }
  table.players.push(player);
  await writeTable(table);
  await publishTable(table.id);
  res.status(201).json({ id: player.id, secret: player.secret });
});

router.get("/:id", async (req, res) => {
  const table = await readTable(String(req.params.id));
  if (!table) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const playerId = typeof req.query.playerId === "string" ? req.query.playerId : undefined;
  res.json(snapshot(table, await readPoker(table.id), playerId));
});
