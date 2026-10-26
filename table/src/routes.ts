import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { createPokerTable, readPoker, seatPoker, unseatPoker } from "./engine.js";
import { liveKitToken, VideoUnavailable } from "./livekit.js";
import { snapshot } from "./snapshot.js";
import { readHost } from "./auth.js";
import { playerName } from "./name.js";
import { openingBackgammon } from "./backgammon.js";
import { createBody, joinBody, liveKitBody, readSchema } from "./schema.js";
import { openTable, noteJoinRefused, notePlayers, noteVideo } from "./events/ledger.js";
import { reportError, reportCaught } from "./events/report.js";
import { seatedCount, tablePassword } from "./players.js";
import { clearPasswordFailures, noteWrongPassword, passwordRetryAfter } from "./password.js";
import { insertTable, publishTable, readTable, removeTable, TableNotFound, withTable, type TableRecord } from "./store.js";

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
    reportError({ area: "auth", route: "create" });
    res.status(401).json({ error: "Sign in with Google to open a table" });
    return;
  }
  const body = readSchema(createBody, req.body);
  if (!body) {
    reportError({ area: "validation", route: "create" });
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const smallBlind = body.smallBlind;
  const buyIn = body.buyIn;
  if (!Number.isInteger(smallBlind) || smallBlind < 1) {
    reportError({ area: "validation", route: "create" });
    res.status(400).json({ error: "smallBlind must be a positive integer" });
    return;
  }
  if (!Number.isInteger(buyIn) || buyIn < smallBlind * 2) {
    reportError({ area: "validation", route: "create" });
    res.status(400).json({ error: "buyIn must be at least two big blinds" });
    return;
  }
  const table: TableRecord = {
    id: tableCode(),
    adminSecret: crypto.randomUUID(),
    smallBlind,
    buyIn,
    password: tablePassword(),
    hostEmail: host.email,
    kind: body.kind === "backgammon" ? "backgammon" : "poker",
    ...(body.kind === "backgammon" ? { backgammon: await openingBackgammon() } : {}),
    players: [],
  };
  try {
    while (!(await insertTable(table))) table.id = tableCode();
    try {
      await createPokerTable(table.id, smallBlind);
    } catch (error) {
      await removeTable(table.id);
      throw error;
    }
    await openTable(table.id, table.kind ?? "poker");
  } catch (error) {
    reportError({ area: "store", op: "create" });
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
  constructor(readonly status: number, message: string, readonly retryAfter = 0) {
    super(message);
  }
}

router.post("/:id/join", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(joinBody, req.body);
  if (!body) {
    reportError({ area: "validation", route: "join", tableId: id });
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const name = playerName(body.name);
  const password = body.password;
  const adminSecret = body.adminSecret ?? "";
  const ip = req.ip ?? "unknown";
  if (!name) {
    await noteJoinRefused(id);
    res.status(400).json({ error: "Name must be 1 to 24 characters" });
    return;
  }
  try {
    const retry = await passwordRetryAfter(id, ip).catch(() => 0);
    if (retry > 0) throw new JoinRefused(429, "Too many password attempts", retry);
    const joined = await withTable(id, async (table) => {
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
      return { player, seated: seatedCount(table) };
    });
    await publishTable(id);
    await notePlayers(id, joined.seated);
    await clearPasswordFailures(id, ip).catch(() => undefined);
    res.status(201).json({ id: joined.player.id, secret: joined.player.secret });
  } catch (error) {
    if (error instanceof JoinRefused && error.message === "Wrong password") {
      const retry = await noteWrongPassword(id, ip).catch(() => 0);
      if (retry > 0) {
        await noteJoinRefused(id);
        res.setHeader("Retry-After", String(retry));
        res.status(429).json({ error: "Too many password attempts" });
        return;
      }
    }
    if (error instanceof JoinRefused) await noteJoinRefused(id);
    else reportCaught(id, error, "join");
    if (error instanceof JoinRefused && error.retryAfter > 0) res.setHeader("Retry-After", String(error.retryAfter));
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
  const body = readSchema(liveKitBody, req.body);
  if (!body) {
    reportError({ area: "validation", route: "livekit", tableId: table.id, kind: table.kind ?? "poker" });
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const playerId = body.playerId;
  const secret = body.secret;
  const player = table.players.find((seat) => seat.id === playerId && seat.secret === secret);
  if (!player) {
    reportError({ area: "auth", route: "livekit", tableId: table.id, kind: table.kind ?? "poker" });
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  try {
    res.json(await liveKitToken(table.id, player.id, player.name));
    await noteVideo(table.id);
  } catch (error) {
    if (error instanceof VideoUnavailable) reportError({ area: "video", route: "livekit", tableId: table.id, kind: table.kind ?? "poker" });
    else reportCaught(table.id, error, "livekit", table.kind ?? "poker");
    const status = error instanceof VideoUnavailable ? 503 : 500;
    res.status(status).json({ error: "Video is not available" });
  }
});

function sameSecret(given: string, expected: string) {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

router.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  if (id.length > 64) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const ip = req.ip ?? "unknown";
  const retry = await passwordRetryAfter(id, ip).catch(() => 0);
  if (retry > 0) {
    res.setHeader("Retry-After", String(retry));
    res.status(429).json({ error: "Too many password attempts" });
    return;
  }
  const table = await readTable(id);
  if (!table) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const playerId = req.get("x-player-id") ?? "";
  const secret = req.get("x-player-secret") ?? "";
  const viewer = table.players.find((player) => sameSecret(playerId, player.id) && sameSecret(secret, player.secret));
  const password = req.get("x-table-password") ?? "";
  if (!viewer && !sameSecret(password, table.password)) {
    if (password) {
      const wait = await noteWrongPassword(id, ip).catch(() => 0);
      if (wait > 0) {
        res.setHeader("Retry-After", String(wait));
        res.status(429).json({ error: "Too many password attempts" });
        return;
      }
      res.status(401).json({ error: "Wrong password" });
      return;
    }
    res.status(401).json({ error: "Sign in to this table" });
    return;
  }
  res.json(snapshot(table, await readPoker(table.id), viewer?.id));
});
