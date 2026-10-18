import { Router } from "express";
import { createPokerTable, readPoker, seatPoker, unseatPoker } from "./engine.js";
import { liveKitToken, VideoUnavailable } from "./livekit.js";
import { snapshot } from "./snapshot.js";
import { readHost } from "./auth.js";
import { insertTable, publishTable, readTable, redis, tableKey, TableNotFound, withTable, type TableRecord } from "./store.js";

export const router = Router();
const MAX_SEATS = 9;
// No 0/O or 1/I, so a code read aloud or copied by hand still matches.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tableCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

router.post("/", async (req, res) => {
  const host = await readHost(req.get("authorization"));
  if (!host) {
    res.status(401).json({ error: "Sign in with Google to open a table" });
    return;
  }
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
    id: tableCode(),
    adminSecret: crypto.randomUUID(),
    smallBlind,
    buyIn,
    password: String(crypto.getRandomValues(new Uint32Array(1))[0]! % 900000 + 100000),
    hostEmail: host.email,
    players: [],
  };
  while (!(await insertTable(table))) table.id = tableCode();
  try {
    await createPokerTable(table.id, smallBlind);
  } catch (error) {
    await redis.del(tableKey(table.id));
    throw error;
  }
  res.status(201).json({
    gameId: table.id,
    adminSecret: table.adminSecret,
    password: table.password,
    state: snapshot(table, await readPoker(table.id)),
  });
});

class JoinRefused extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

router.post("/:id/join", async (req, res) => {
  const id = String(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const password = String(req.body?.password ?? "");
  const adminSecret = String(req.body?.adminSecret ?? "");
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  try {
    const player = await withTable(id, async (table) => {
      if (!table.password || password !== table.password) throw new JoinRefused(403, "Wrong password");
      const taken = new Set(table.players.map((player) => player.seat));
      const seat = Array.from({ length: MAX_SEATS }, (_, index) => index).find((index) => !taken.has(index));
      if (seat === undefined) throw new JoinRefused(400, "Table is full");
      const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), seat, bought: table.buyIn };
      await seatPoker(table.id, seat, table.buyIn);
      table.players.push(player);
      if (table.adminSecret && adminSecret === table.adminSecret) {
        table.adminId = player.id;
        delete table.adminSecret;
      } else if (!table.adminId) {
        table.adminId = player.id;
      }
      return player;
    });
    await publishTable(id);
    res.status(201).json({ id: player.id, secret: player.secret });
  } catch (error) {
    const status = error instanceof TableNotFound ? 404 : error instanceof JoinRefused ? error.status : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : "Join failed" });
  }
});

router.post("/:id/livekit", async (req, res) => {
  const table = await readTable(String(req.params.id));
  if (!table) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const playerId = String(req.body?.playerId ?? "");
  const secret = String(req.body?.secret ?? "");
  const player = table.players.find((seat) => seat.id === playerId && seat.secret === secret);
  if (!player) {
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  try {
    res.json(await liveKitToken(table.id, player.id, player.name));
  } catch (error) {
    const status = error instanceof VideoUnavailable ? 503 : 500;
    res.status(status).json({ error: "Video is not available" });
  }
});

router.get("/:id", async (req, res) => {
  const table = await readTable(String(req.params.id));
  if (!table) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const playerId = req.get("x-player-id") ?? "";
  const secret = req.get("x-player-secret") ?? "";
  const viewer = table.players.find((player) => player.id === playerId && player.secret === secret);
  res.json(snapshot(table, await readPoker(table.id), viewer?.id));
});
