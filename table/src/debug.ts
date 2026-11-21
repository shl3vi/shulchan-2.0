import { timingSafeEqual } from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { openTable } from "./events/ledger.js";
import { allGames, gameFor, type GameKind } from "./games/index.js";
import type { GameDebug } from "./games/types.js";
import { playerName } from "./name.js";
import { assignAdmin, releaseSeat, tablePassword } from "./players.js";
import { readSchema } from "./schema.js";
import { freeSeats } from "./seats.js";
import { insertTable, publishTable, readTable, TableNotFound, withTable } from "./store.js";

const addBody = z.object({ name: z.string() }).strict();
const playerBody = z.object({ playerId: z.string().min(1) }).strict();

/** One permanent table per game, set up from environment variables, with a private page to drive it. */
export type DebugConfig = {
  kind: GameKind;
  debug: GameDebug<any>;
  tableId: string;
  dashboardId: string;
  password: string | null;
  settings: object;
};

let cached: DebugConfig[] | undefined;

/** Every game whose debug table is switched on. */
export function debugConfigs(): DebugConfig[] {
  if (cached) return cached;
  const found: DebugConfig[] = [];
  for (const [kind, game] of allGames()) {
    if (!game.debug) continue;
    const config = loadDebugConfig(kind, game.debug, found);
    if (config) found.push(config);
  }
  cached = found;
  return found;
}

export function isDebugTable(tableId: string) {
  return debugConfigs().some((config) => config.tableId === tableId);
}

function loadDebugConfig(kind: GameKind, debug: GameDebug<any>, others: DebugConfig[]): DebugConfig | null {
  const prefix = debug.envPrefix;
  const off = `${debug.label} table is off.`;
  const tableId = process.env[`${prefix}_TABLE_ID`]?.trim() ?? "";
  const dashboardId = process.env[`${prefix}_DASHBOARD_ID`]?.trim() ?? "";
  if (!tableId && !dashboardId) return null;
  if (!tableId || !dashboardId || dashboardId.length < 16 || tableId.length > 64 || tableId.includes("/") || dashboardId.includes("/")) {
    console.error(`${off} Set ${prefix}_TABLE_ID and a ${prefix}_DASHBOARD_ID of at least 16 characters.`);
    return null;
  }
  if (others.some((other) => other.tableId === tableId)) {
    console.error(`${off} ${prefix}_TABLE_ID must differ from every other debug table's id.`);
    return null;
  }
  const read = (name: string) => {
    for (const each of [prefix, ...(debug.fallbackPrefixes ?? [])]) {
      const value = process.env[`${each}_TABLE_${name}`];
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const settings = debug.settings(read);
  if ("error" in settings) {
    console.error(`${off} ${settings.error}`);
    return null;
  }
  const password = process.env[`${prefix}_TABLE_PASSWORD`]?.trim() || null;
  if (password !== null && !/^\d{6}$/.test(password)) {
    console.error(`${off} ${prefix}_TABLE_PASSWORD must be six digits.`);
    return null;
  }
  return { kind, debug, tableId, dashboardId, password, settings: settings.settings };
}

export async function openDebugTable(config: DebugConfig) {
  const game = gameFor(config.kind);
  let last: unknown;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      if (!(await readTable(config.tableId))) {
        const table = await game.open({
          id: config.tableId,
          password: config.password ?? tablePassword(),
          players: [],
        }, config.settings);
        if (await insertTable(table)) await openTable(table.id, config.kind);
      }
      const table = await readTable(config.tableId);
      if (!table) throw new Error("Debug table missing");
      if (config.password && table.password !== config.password) {
        await withTable(config.tableId, async (current) => {
          current.password = config.password!;
        });
      }
      await config.debug.repair(config.tableId);
      console.log(`${config.debug.label} table ${config.tableId} is ready`);
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw last instanceof Error ? last : new Error("Debug table was not created");
}

export async function ensureDebugTable(config: DebugConfig) {
  try {
    await openDebugTable(config);
  } catch (error) {
    console.error("Debug table was not created", error instanceof Error ? error.message : error);
  }
}

function sameToken(given: string, expected: string) {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function debugState(config: DebugConfig) {
  const table = await readTable(config.tableId);
  if (!table) throw new TableNotFound();
  return config.debug.state(table);
}

async function resetTable(config: DebugConfig) {
  const current = await readTable(config.tableId);
  if (!current) throw new TableNotFound();
  await withTable(config.tableId, async (table) => {
    table.players = [];
    delete table.adminId;
    delete table.adminSecret;
    delete table.paused;
    delete table.idleCarry;
    delete table.idleCloseAt;
    delete table.closing;
    table.lastActivityAt = Date.now();
    await config.debug.reset(table);
  });
  await publishTable(config.tableId);
}

async function addPlayer(config: DebugConfig, name: string) {
  const game = gameFor(config.kind);
  await withTable(config.tableId, async (table) => {
    const seat = freeSeats(game.seats.max, table.players.map((player) => player.seat))[0];
    if (seat === undefined) throw new Error("Table is full");
    const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), seat };
    await game.seat(table, player);
    table.players.push(player);
    if (!table.adminId) table.adminId = player.id;
  });
  await publishTable(config.tableId);
}

async function removePlayer(config: DebugConfig, playerId: string) {
  await withTable(config.tableId, async (table) => {
    await releaseSeat(table, playerId);
  });
  await publishTable(config.tableId);
}

async function changeAdmin(config: DebugConfig, playerId: string) {
  await withTable(config.tableId, async (table) => {
    const next = table.players.find((player) => player.id === playerId && !player.pendingRemoval);
    if (!next) throw new Error("Player not found");
    if (next.web) throw new Error("A player in the browser cannot be admin");
    assignAdmin(table, next.id);
  });
  await publishTable(config.tableId);
}

export function debugRouter(config: DebugConfig) {
  const router = Router();

  async function respond(res: Response, run: (tableId: string) => Promise<void>) {
    try {
      await run(config.tableId);
      res.json(await debugState(config));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
    }
  }

  router.use("/:token", (req, res, next) => {
    const token = String(req.params.token ?? "");
    if (!sameToken(token, config.dashboardId)) {
      res.sendStatus(404);
      return;
    }
    next();
  });

  router.get("/:token", (_req, res) => {
    res.setHeader("cache-control", "no-store");
    res.type("html").send(config.debug.page());
  });

  router.get("/:token/state", async (_req, res) => {
    try {
      res.json(await debugState(config));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
    }
  });

  router.post("/:token/open", async (_req, res) => {
    await respond(res, () => openDebugTable(config));
  });

  router.post("/:token/reset", async (_req, res) => {
    await respond(res, () => resetTable(config));
  });

  router.post("/:token/players", async (req, res) => {
    const body = readSchema(addBody, req.body);
    const name = body ? playerName(body.name) : null;
    if (!name) {
      res.status(400).json({ error: "Name must be 1 to 24 characters" });
      return;
    }
    await respond(res, () => addPlayer(config, name));
  });

  router.post("/:token/remove", async (req, res) => {
    const body = readSchema(playerBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await respond(res, () => removePlayer(config, body.playerId));
  });

  router.post("/:token/admin", async (req, res) => {
    const body = readSchema(playerBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await respond(res, () => changeAdmin(config, body.playerId));
  });

  config.debug.routes(router, respond);
  return router;
}
