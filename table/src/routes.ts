import { Router } from "express";
import { considerAutoDeal } from "./autodeal.js";
import { createPokerTable, readPoker, seatPoker } from "./engine.js";
import { liveKitToken, mediaRoom, VideoUnavailable } from "./livekit.js";
import { snapshot } from "./snapshot.js";
import { readHost } from "./auth.js";
import { nameProblem, playerName } from "./name.js";
import { chooseSeat } from "./seats.js";
import { avoidSeats, blockPerson, blockedSeatIds, storeReport, unblockPerson } from "./safety.js";
import { openingBackgammon } from "./backgammon.js";
import { blockBody, createBody, joinBody, liveKitBody, readSchema, reportBody } from "./schema.js";
import { openTable, noteJoinRefused, notePlayers, noteVideo } from "./events/ledger.js";
import { reportError, reportCaught } from "./events/report.js";
import { sameSecret, seatedCount, tablePassword } from "./players.js";
import { clearPasswordFailures, noteWrongPassword, passwordRetryAfter } from "./password.js";
import { HostTableLimit, insertHostTable, OPEN_TABLE_CAP, openTableCount, publishTable, readTable, TableNotFound, withTable, type TableRecord } from "./store.js";

export const router = Router();
// No 0/O or 1/I, so a code read aloud or copied by hand still matches.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tableCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

router.post("/", async (req, res) => {
  const host = await readHost(req.get("authorization"));
  if (!host) {
    reportError({ area: "auth", route: "create" });
    res.status(401).json({ error: "Sign in to open a table" });
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
  if (await openTableCount(host.email) >= OPEN_TABLE_CAP) {
    res.status(429).json({ error: "You already have two tables open" });
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
    lastActivityAt: Date.now(),
    ...(body.kind !== "backgammon" && body.autoDeal ? { autoDeal: true } : {}),
    players: [],
  };
  const view = await createPokerTable(table, smallBlind);
  if (body.kind === "backgammon") table.backgammon = await openingBackgammon();
  try {
    while (!(await insertHostTable(table))) table.id = tableCode();
    await openTable(table.id, table.kind ?? "poker");
  } catch (error) {
    if (error instanceof HostTableLimit) {
      res.status(429).json({ error: error.message });
      return;
    }
    reportError({ area: "store", op: "create" });
    throw error;
  }
  res.status(201).json({
    gameId: table.id,
    adminSecret: table.adminSecret,
    password: table.password,
    state: snapshot(table, view),
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
  const problem = nameProblem(body.name);
  const name = playerName(body.name);
  const password = body.password;
  const adminSecret = body.adminSecret ?? "";
  const personKey = body.personKey;
  const ip = req.ip ?? "unknown";
  if (!name || problem) {
    await noteJoinRefused(id);
    res.status(400).json({ error: problem === "blocked" ? "Choose another name" : "Name must be 1 to 24 characters" });
    return;
  }
  try {
    const retry = await passwordRetryAfter(id, ip).catch(() => 0);
    if (retry > 0) throw new JoinRefused(429, "Too many password attempts", retry);
    const joined = await withTable(id, async (table) => {
      if (table.closing) throw new JoinRefused(409, "Table is closing");
      if (!sameSecret(password, table.password)) throw new JoinRefused(403, "Wrong password");
      const taken = table.players.map((player) => player.seat);
      const avoid = await avoidSeats(personKey, table.players).catch(() => []);
      const seat = chooseSeat(taken, avoid, table.kind === "backgammon" ? "backgammon" : "poker");
      if (seat === undefined) throw new JoinRefused(400, "Table is full");
      const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), personKey, seat, bought: table.buyIn };
      await seatPoker(table, seat, table.buyIn);
      table.players.push(player);
      if (table.adminSecret && sameSecret(adminSecret, table.adminSecret)) {
        table.adminId = player.id;
        delete table.adminSecret;
      } else if (!table.adminId) {
        table.adminId = player.id;
      }
      return { player, seated: seatedCount(table) };
    });
    await publishTable(id);
    void considerAutoDeal(id);
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
  const player = table.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(secret, seat.secret));
  if (!player) {
    reportError({ area: "auth", route: "livekit", tableId: table.id, kind: table.kind ?? "poker" });
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  if (table.paused || table.closing) {
    res.status(403).json({ error: "Table is paused" });
    return;
  }
  try {
    const fresh = await readTable(table.id);
    const still = fresh?.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(secret, seat.secret));
    if (!fresh || !still) {
      res.status(401).json({ error: "Invalid player" });
      return;
    }
    if (fresh.paused || fresh.closing) {
      res.status(403).json({ error: "Table is paused" });
      return;
    }
    res.json(await liveKitToken(mediaRoom(fresh.id, fresh.mediaEpoch), still.id, still.name));
    await noteVideo(table.id);
  } catch (error) {
    if (error instanceof VideoUnavailable) reportError({ area: "video", route: "livekit", tableId: table.id, kind: table.kind ?? "poker" });
    else reportCaught(table.id, error, "livekit", table.kind ?? "poker");
    const status = error instanceof VideoUnavailable ? 503 : 500;
    res.status(status).json({ error: "Video is not available" });
  }
});

async function seatedPlayer(tableId: string, playerId: string, secret: string) {
  const table = await readTable(tableId);
  if (!table) return null;
  const player = table.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(secret, seat.secret));
  if (!player?.personKey) return null;
  return { table, player: { ...player, personKey: player.personKey } };
}

router.post("/:id/report", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(reportBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  try {
    await storeReport({
      tableId: id,
      reporterKey: seated.player.personKey,
      reporterName: seated.player.name,
      reportedKey: target.personKey,
      reportedName: target.name,
      reason: body.reason,
    });
  } catch (error) {
    reportCaught(id, error, "report", seated.table.kind ?? "poker");
    res.status(500).json({ error: "Could not store the report" });
    return;
  }
  res.json({ ok: true });
});

router.post("/:id/block", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(blockBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  try {
    await blockPerson(seated.player.personKey, target.personKey);
  } catch (error) {
    reportCaught(id, error, "block", seated.table.kind ?? "poker");
    res.status(500).json({ error: "Could not update the block" });
    return;
  }
  await publishTable(id);
  res.json({ ok: true });
});

router.post("/:id/unblock", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(blockBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player" });
    return;
  }
  try {
    await unblockPerson(seated.player.personKey, target.personKey);
  } catch (error) {
    reportCaught(id, error, "unblock", seated.table.kind ?? "poker");
    res.status(500).json({ error: "Could not update the block" });
    return;
  }
  await publishTable(id);
  res.json({ ok: true });
});

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
  const blocked = await blockedSeatIds(viewer?.personKey, table.players).catch(() => new Set<string>());
  res.json(snapshot(table, await readPoker(table), viewer?.id, blocked));
});
