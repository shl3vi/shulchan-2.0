import { codeOf, messageOf, REFUSAL, type RefusalCode } from "./errors.js";
import { Router } from "express";
import { gameFor, gameOf, kindOf, requestedKind } from "./games/index.js";
import { liveKitToken, mediaRoom, VideoUnavailable } from "./livekit.js";
import { readHost } from "./auth.js";
import { nameProblem, playerName } from "./name.js";
import { avoidSeats, blockPerson, blockedSeatIds, storeReport, unblockPerson } from "./safety.js";
import { tableSnapshot } from "./view.js";
import { blockBody, joinBody, liveKitBody, readSchema, reportBody } from "./schema.js";
import { openTable, noteJoin, noteJoinRefused, notePlayers, noteVideo } from "./events/ledger.js";
import { reportError, reportCaught } from "./events/report.js";
import { sameSecret, seatedCount, tablePassword } from "./players.js";
import { clearPasswordFailures, noteWrongPassword, passwordRetryAfter } from "./password.js";
import { HostTableLimit, insertHostTable, OPEN_TABLE_CAP, openTableCount, publishTable, readTable, RECORD_VERSION, TableNotFound, withTable, type TableRecord } from "./store.js";

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
    res.status(401).json({ error: "Sign in to open a table", code: REFUSAL.signInNeeded });
    return;
  }
  const kind = requestedKind(req.body);
  const game = kind ? gameFor(kind) : null;
  const read = game?.settings(req.body) ?? { error: "Invalid request" };
  if (!kind || !game || "error" in read) {
    reportError({ area: "validation", route: "create" });
    res.status(400).json({ error: "error" in read ? read.error : "Invalid request", code: REFUSAL.invalid });
    return;
  }
  if (await openTableCount(host.email) >= OPEN_TABLE_CAP) {
    res.status(429).json({ error: "You already have two tables open", code: REFUSAL.tableLimit });
    return;
  }
  const table: TableRecord = {
    v: RECORD_VERSION,
    id: tableCode(),
    adminSecret: crypto.randomUUID(),
    password: tablePassword(),
    hostEmail: host.email,
    lastActivityAt: Date.now(),
    players: [],
    game: await game.open(read.settings),
  };
  try {
    while (!(await insertHostTable(table))) table.id = tableCode();
    await openTable(table.id, kind);
  } catch (error) {
    if (error instanceof HostTableLimit) {
      res.status(429).json({ error: error.message, code: REFUSAL.tableLimit });
      return;
    }
    reportError({ area: "store", op: "create" });
    throw error;
  }
  res.status(201).json({
    gameId: table.id,
    adminSecret: table.adminSecret,
    password: table.password,
    state: await tableSnapshot(table),
  });
});

class JoinRefused extends Error {
  constructor(readonly status: number, message: string, readonly code: RefusalCode, readonly retryAfter = 0) {
    super(message);
  }
}

router.post("/:id/join", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(joinBody, req.body);
  if (!body) {
    reportError({ area: "validation", route: "join", tableId: id });
    res.status(400).json({ error: "Invalid request", code: REFUSAL.invalid });
    return;
  }
  const problem = nameProblem(body.name);
  const name = playerName(body.name);
  const password = body.password;
  const adminSecret = body.adminSecret ?? "";
  const personKey = body.personKey;
  // A browser always sends Origin on a POST; the app never does. So a page cannot pass itself off as the app.
  const web = body.platform === "web" || req.get("origin") != null;
  const ip = req.ip ?? "unknown";
  if (!name || problem) {
    await noteJoinRefused(id);
    res.status(400).json(problem === "blocked"
      ? { error: "Choose another name", code: REFUSAL.nameBlocked }
      : { error: "Name must be 1 to 24 characters", code: REFUSAL.nameLength });
    return;
  }
  try {
    const retry = await passwordRetryAfter(id, ip).catch(() => 0);
    if (retry > 0) throw new JoinRefused(429, "Too many password attempts", REFUSAL.passwordAttempts, retry);
    const joined = await withTable(id, async (table) => {
      if (table.closing) throw new JoinRefused(409, "Table is closing", REFUSAL.closing);
      if (!sameSecret(password, table.password)) throw new JoinRefused(403, "Wrong password", REFUSAL.wrongPassword);
      const taken = table.players.map((player) => player.seat);
      const avoid = await avoidSeats(personKey, table.players).catch(() => []);
      const game = gameOf(table);
      const seat = game.chooseSeat(taken, avoid);
      if (seat === undefined) throw new JoinRefused(400, "Table is full", REFUSAL.tableFull);
      const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), personKey, seat, ...(web ? { web: true } : {}) };
      await game.seat(table, player);
      table.players.push(player);
      // Only the app can be admin. The browser cannot open a table, so it never holds the admin secret.
      if (!web && table.adminSecret && sameSecret(adminSecret, table.adminSecret)) {
        table.adminId = player.id;
        delete table.adminSecret;
      } else if (!web && !table.adminId) {
        table.adminId = player.id;
      }
      return { player, seated: seatedCount(table) };
    });
    await publishTable(id);
    await notePlayers(id, joined.seated);
    await noteJoin(id, web);
    await clearPasswordFailures(id, ip).catch(() => undefined);
    res.status(201).json({ id: joined.player.id, secret: joined.player.secret });
  } catch (error) {
    if (error instanceof JoinRefused && error.code === REFUSAL.wrongPassword) {
      const retry = await noteWrongPassword(id, ip).catch(() => 0);
      if (retry > 0) {
        await noteJoinRefused(id);
        res.setHeader("Retry-After", String(retry));
        res.status(429).json({ error: "Too many password attempts", code: REFUSAL.passwordAttempts });
        return;
      }
    }
    if (error instanceof JoinRefused) await noteJoinRefused(id);
    else reportCaught(id, error, "join");
    if (error instanceof JoinRefused && error.retryAfter > 0) res.setHeader("Retry-After", String(error.retryAfter));
    const status = error instanceof TableNotFound ? 404 : error instanceof JoinRefused ? error.status : 400;
    res.status(status).json(error instanceof JoinRefused
      ? { error: error.message, code: error.code }
      : { error: messageOf(error, "Join failed"), code: codeOf(error) });
  }
});

router.post("/:id/livekit", async (req, res) => {
  const table = await readTable(String(req.params.id));
  if (!table) {
    res.status(404).json({ error: "Game not found", code: REFUSAL.notFound });
    return;
  }
  const body = readSchema(liveKitBody, req.body);
  if (!body) {
    reportError({ area: "validation", route: "livekit", tableId: table.id, kind: kindOf(table) });
    res.status(400).json({ error: "Invalid request", code: REFUSAL.invalid });
    return;
  }
  const playerId = body.playerId;
  const secret = body.secret;
  const player = table.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(secret, seat.secret));
  if (!player) {
    reportError({ area: "auth", route: "livekit", tableId: table.id, kind: kindOf(table) });
    res.status(401).json({ error: "Invalid player", code: REFUSAL.notSeated });
    return;
  }
  if (table.paused || table.closing) {
    res.status(403).json({ error: "Table is paused", code: REFUSAL.paused });
    return;
  }
  try {
    const fresh = await readTable(table.id);
    const still = fresh?.players.find((seat) => sameSecret(playerId, seat.id) && sameSecret(secret, seat.secret));
    if (!fresh || !still) {
      res.status(401).json({ error: "Invalid player", code: REFUSAL.notSeated });
      return;
    }
    if (fresh.paused || fresh.closing) {
      res.status(403).json({ error: "Table is paused", code: REFUSAL.paused });
      return;
    }
    res.json(await liveKitToken(mediaRoom(fresh.id, fresh.mediaEpoch), still.id, still.name));
    await noteVideo(table.id);
  } catch (error) {
    if (error instanceof VideoUnavailable) reportError({ area: "video", route: "livekit", tableId: table.id, kind: kindOf(table) });
    else reportCaught(table.id, error, "livekit", kindOf(table));
    const status = error instanceof VideoUnavailable ? 503 : 500;
    res.status(status).json({ error: "Video is not available", code: REFUSAL.videoOff });
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
    res.status(400).json({ error: "Invalid request", code: REFUSAL.invalid });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player", code: REFUSAL.notSeated });
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
    reportCaught(id, error, "report", kindOf(seated.table));
    res.status(500).json({ error: "Could not store the report", code: REFUSAL.reportFailed });
    return;
  }
  res.json({ ok: true });
});

router.post("/:id/block", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(blockBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request", code: REFUSAL.invalid });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player", code: REFUSAL.notSeated });
    return;
  }
  try {
    await blockPerson(seated.player.personKey, target.personKey);
  } catch (error) {
    reportCaught(id, error, "block", kindOf(seated.table));
    res.status(500).json({ error: "Could not update the block", code: REFUSAL.blockFailed });
    return;
  }
  await publishTable(id);
  res.json({ ok: true });
});

router.post("/:id/unblock", async (req, res) => {
  const id = String(req.params.id);
  const body = readSchema(blockBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request", code: REFUSAL.invalid });
    return;
  }
  const seated = await seatedPlayer(id, body.playerId, body.secret);
  const target = seated?.table.players.find((seat) => seat.id === body.targetId && seat.id !== seated.player.id);
  if (!seated || !target?.personKey) {
    res.status(401).json({ error: "Invalid player", code: REFUSAL.notSeated });
    return;
  }
  try {
    await unblockPerson(seated.player.personKey, target.personKey);
  } catch (error) {
    reportCaught(id, error, "unblock", kindOf(seated.table));
    res.status(500).json({ error: "Could not update the block", code: REFUSAL.blockFailed });
    return;
  }
  await publishTable(id);
  res.json({ ok: true });
});

router.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  if (id.length > 64) {
    res.status(404).json({ error: "Game not found", code: REFUSAL.notFound });
    return;
  }
  const ip = req.ip ?? "unknown";
  const retry = await passwordRetryAfter(id, ip).catch(() => 0);
  if (retry > 0) {
    res.setHeader("Retry-After", String(retry));
    res.status(429).json({ error: "Too many password attempts", code: REFUSAL.passwordAttempts });
    return;
  }
  const table = await readTable(id);
  if (!table) {
    res.status(404).json({ error: "Game not found", code: REFUSAL.notFound });
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
        res.status(429).json({ error: "Too many password attempts", code: REFUSAL.passwordAttempts });
        return;
      }
      res.status(401).json({ error: "Wrong password", code: REFUSAL.wrongPassword });
      return;
    }
    res.status(401).json({ error: "Sign in to this table", code: REFUSAL.seatNeeded });
    return;
  }
  const blocked = await blockedSeatIds(viewer?.personKey, table.players).catch(() => new Set<string>());
  res.json(await tableSnapshot(table, viewer?.id, blocked));
});
