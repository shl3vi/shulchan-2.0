import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { actPoker, addChips, createPokerTable, readPoker, seatPoker, startPoker, type ActionName } from "./engine.js";
import { playerName } from "./name.js";
import { assignAdmin, dropRemovedPlayers, releaseSeat, tablePassword } from "./players.js";
import { chipAmount, MAX_CHIPS, readSchema } from "./schema.js";
import { snapshot } from "./snapshot.js";
import { openTable } from "./events/ledger.js";
import { insertTable, publishTable, readTable, TableNotFound, withTable, type TableRecord } from "./store.js";

const MAX_SEATS = 9;

const addBody = z.object({ name: z.string() }).strict();
const playerBody = z.object({ playerId: z.string().min(1) }).strict();
const rebuyBody = z.object({ playerId: z.string().min(1), amount: chipAmount }).strict();
const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: chipAmount.optional(),
}).strict();

export type DebugConfig = {
  tableId: string;
  dashboardId: string;
  smallBlind: number;
  buyIn: number;
  password: string | null;
};

let cached: DebugConfig | null | undefined;

export function debugConfig(): DebugConfig | null {
  if (cached === undefined) cached = loadDebugConfig();
  return cached;
}

function loadDebugConfig(): DebugConfig | null {
  const tableId = process.env.DEBUG_TABLE_ID?.trim() ?? "";
  const dashboardId = process.env.DEBUG_DASHBOARD_ID?.trim() ?? "";
  if (!tableId && !dashboardId) return null;
  if (!tableId || !dashboardId || dashboardId.length < 16 || tableId.length > 64 || tableId.includes("/") || dashboardId.includes("/")) {
    console.error("Debug table is off. Set DEBUG_TABLE_ID and a DEBUG_DASHBOARD_ID of at least 16 characters.");
    return null;
  }
  const smallBlind = Number(process.env.DEBUG_TABLE_SMALL_BLIND ?? 1);
  const buyIn = Number(process.env.DEBUG_TABLE_BUY_IN ?? 100);
  if (!Number.isInteger(smallBlind) || smallBlind < 1 || !Number.isInteger(buyIn) || buyIn < smallBlind * 2) {
    console.error("Debug table is off. Check DEBUG_TABLE_SMALL_BLIND and DEBUG_TABLE_BUY_IN.");
    return null;
  }
  const password = process.env.DEBUG_TABLE_PASSWORD?.trim() || null;
  if (password !== null && !/^\d{6}$/.test(password)) {
    console.error("Debug table is off. DEBUG_TABLE_PASSWORD must be six digits.");
    return null;
  }
  return { tableId, dashboardId, smallBlind, buyIn, password };
}

export async function ensureDebugTable(config: DebugConfig) {
  let last: unknown;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      if (!(await readTable(config.tableId))) {
        const table: TableRecord = {
          id: config.tableId,
          smallBlind: config.smallBlind,
          buyIn: config.buyIn,
          password: config.password ?? tablePassword(),
          players: [],
        };
        await createPokerTable(table, config.smallBlind);
        if (await insertTable(table)) await openTable(table.id, "poker");
      }
      const table = await readTable(config.tableId);
      if (!table) throw new Error("Debug table missing");
      if (config.password && table.password !== config.password) {
        await withTable(config.tableId, async (current) => {
          current.password = config.password!;
        });
      }
      try {
        await readPoker(table);
      } catch {
        await withTable(config.tableId, async (current) => {
          await createPokerTable(current, current.smallBlind);
        });
      }
      console.log(`Debug table ${config.tableId} is ready`);
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  console.error("Debug table was not created", last instanceof Error ? last.message : last);
}

function sameToken(given: string, expected: string) {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function debugState(tableId: string) {
  const table = await readTable(tableId);
  if (!table) throw new TableNotFound();
  const view = await readPoker(table);
  const snap = snapshot(table, view);
  const holes = new Map(view.holeCards.map((entry) => [entry.seat, entry.cards]));
  return {
    id: table.id,
    password: table.password,
    smallBlind: snap.smallBlind,
    bigBlind: snap.bigBlind,
    buyIn: snap.buyIn,
    status: snap.status,
    round: snap.round,
    communityCards: snap.communityCards,
    pots: snap.pots,
    legalActions: view.legalActions,
    chipRange: view.chipRange,
    playerToActId: snap.playerToActId,
    lastWinners: snap.lastWinners,
    players: snap.players.map((player) => ({
      ...player,
      isAdmin: player.id === table.adminId,
      holeCards: holes.get(player.seat) ?? snap.shownCards.find((shown) => shown.seat === player.seat)?.cards ?? [],
    })),
  };
}

async function resetTable(config: DebugConfig) {
  const current = await readTable(config.tableId);
  if (!current) throw new TableNotFound();
  await withTable(config.tableId, async (table) => {
    await createPokerTable(table, table.smallBlind);
    table.players = [];
    delete table.adminId;
    delete table.adminSecret;
  });
  await publishTable(config.tableId);
}

async function addPlayer(config: DebugConfig, name: string) {
  await withTable(config.tableId, async (table) => {
    const taken = new Set(table.players.map((player) => player.seat));
    const seat = Array.from({ length: MAX_SEATS }, (_, index) => index).find((index) => !taken.has(index));
    if (seat === undefined) throw new Error("Table is full");
    const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), seat, bought: table.buyIn };
    await seatPoker(table, seat, table.buyIn);
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
    assignAdmin(table, next.id);
  });
  await publishTable(config.tableId);
}

async function rebuy(config: DebugConfig, playerId: string, amount: number) {
  await withTable(config.tableId, async (table) => {
    if (!Number.isInteger(amount) || amount < 1 || amount > table.buyIn) {
      throw new Error("Buy-in must be a whole number up to the table buy-in");
    }
    const seated = table.players.find((player) => player.id === playerId && !player.pendingRemoval);
    if (!seated) throw new Error("Player not found");
    await addChips(table, seated.seat, amount);
    seated.bought = (seated.bought ?? table.buyIn) + amount;
  });
  await publishTable(config.tableId);
}

async function act(config: DebugConfig, action: ActionName, amount?: number) {
  if ((action === "bet" || action === "raise") && (amount == null || !Number.isInteger(amount) || amount < 1 || amount > MAX_CHIPS)) {
    throw new Error("Bet size is outside the allowed range");
  }
  const table = await readTable(config.tableId);
  if (!table) throw new TableNotFound();
  const view = await readPoker(table);
  const actor = view.playerToActSeat == null ? undefined : table.players.find((player) => player.seat === view.playerToActSeat);
  if (!actor) throw new Error("No action is open");
  await withTable(config.tableId, async (current) => {
    const seated = current.players.find((player) => player.id === actor.id);
    if (!seated) throw new Error("No action is open");
    await actPoker(current, seated.seat, action, amount);
    await dropRemovedPlayers(current);
  });
  await publishTable(config.tableId);
}

async function deal(config: DebugConfig) {
  await withTable(config.tableId, async (table) => {
    await startPoker(table);
    await dropRemovedPlayers(table);
  });
  await publishTable(config.tableId);
}

export function debugRouter(config: DebugConfig) {
  const router = Router();

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
    res.type("html").send(debugPage());
  });

  router.get("/:token/state", async (_req, res) => {
    try {
      res.json(await debugState(config.tableId));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
    }
  });

  router.post("/:token/reset", async (_req, res) => {
    await respond(res, config, () => resetTable(config));
  });

  router.post("/:token/players", async (req, res) => {
    const body = readSchema(addBody, req.body);
    const name = body ? playerName(body.name) : null;
    if (!name) {
      res.status(400).json({ error: "Name must be 1 to 24 characters" });
      return;
    }
    await respond(res, config, () => addPlayer(config, name));
  });

  router.post("/:token/remove", async (req, res) => {
    const body = readSchema(playerBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await respond(res, config, () => removePlayer(config, body.playerId));
  });

  router.post("/:token/admin", async (req, res) => {
    const body = readSchema(playerBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await respond(res, config, () => changeAdmin(config, body.playerId));
  });

  router.post("/:token/rebuy", async (req, res) => {
    const body = readSchema(rebuyBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await respond(res, config, () => rebuy(config, body.playerId, body.amount));
  });

  router.post("/:token/act", async (req, res) => {
    const body = readSchema(actBody, req.body);
    if (!body) {
      res.status(400).json({ error: "Unknown action" });
      return;
    }
    await respond(res, config, () => act(config, body.action, body.amount));
  });

  router.post("/:token/deal", async (_req, res) => {
    await respond(res, config, () => deal(config));
  });

  return router;
}

async function respond(res: import("express").Response, config: DebugConfig, run: () => Promise<void>) {
  try {
    await run();
    res.json(await debugState(config.tableId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
}

function debugPage() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Table</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #07110d; color: #fafaf9; font: 14px/1.3 sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px 16px 128px; }
  .top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  .meta, .empty { color: #a8a29e; }
  .error { color: #fca5a5; min-height: 1.2em; margin: 8px 0; }
  code { color: #f6d36b; }
  button, input { font: inherit; }
  button { background: #f6d36b; color: #1c1917; border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
  button.ghost { background: #1c1917cc; color: #fafaf9; border: 1px solid #44403c; }
  button:disabled { opacity: 0.4; cursor: default; }
  input { background: #0c0a09; color: #fafaf9; border: 1px solid #44403c; border-radius: 8px; padding: 6px 8px; width: 72px; }
  .stage { position: relative; height: calc(100vh - 132px); min-height: 520px; margin-top: 4px; }
  .rail { position: absolute; left: 8%; right: 8%; top: 8%; bottom: 12%; border-radius: 50%; background: #5c3a1e; box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  .felt { position: absolute; inset: 14px; border-radius: 50%; background: radial-gradient(ellipse at center, #249154 0%, #0e5a32 72%, #083d22 100%); box-shadow: inset 0 0 0 2px rgba(255,255,255,.08); }
  .center { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 2; }
  .board, .holes { display: flex; gap: 4px; }
  .pot { background: #111827cc; border-radius: 999px; padding: 4px 10px; font-weight: 800; }
  .pcard { width: 34px; height: 48px; border-radius: 4px; background: white; color: #1c1917; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,.35); }
  .pcard .rank { font-size: 14px; font-weight: 800; line-height: 1; }
  .pcard .suit { font-size: 13px; line-height: 1; }
  .pcard.red { color: #b91c1c; }
  .pcard.empty { background: transparent; box-shadow: none; border: 1px solid rgba(255,255,255,.22); }
  .seat { position: absolute; width: 148px; transform: translate(-50%, -50%); z-index: 3; text-align: center; }
  .plate { background: #111827ee; border: 1px solid #292524; border-radius: 12px; padding: 6px; }
  .seat.turn .plate { border-color: #f6d36b; box-shadow: 0 0 0 2px #f6d36b; }
  .seat.out { opacity: 0.55; }
  .name { font-weight: 800; }
  .stack { color: #f6d36b; font-weight: 700; }
  .ops { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; margin-top: 4px; }
  .plate .ops button, .plate .ops input { padding: 2px 5px; font-size: 11px; }
  .plate .ops input { width: 46px; }
  .chip { position: absolute; z-index: 4; width: 28px; height: 28px; border-radius: 50%; transform: translate(-50%, -50%); background: #b45309; border: 2px solid #f6e2a8; color: #fef3c7; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
  .dock { position: fixed; left: 0; right: 0; bottom: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; padding: 12px 16px; background: #0c0a09f2; border-top: 1px solid #292524; }
</style>
<main>
  <div class="top">
    <div id="info"></div>
    <form id="add" class="ops">
      <input name="name" placeholder="Name" maxlength="24" required style="width:120px">
      <button type="submit">Add player</button>
    </form>
  </div>
  <p class="error" id="error"></p>
  <div class="stage" id="stage"></div>
</main>
<div class="dock">
  <span id="actor" class="meta"></span>
  <span id="actions" class="ops"></span>
  <span id="sizing" class="ops"></span>
  <button id="deal" type="button">Deal</button>
  <button id="reset" class="ghost" type="button">Reset</button>
</div>
<script>
  const base = location.pathname.replace(/\\/$/, "");
  const suits = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const spots = [0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle) => {
    const rad = angle * Math.PI / 180;
    return [50 - Math.sin(rad) * 40, 48 + Math.cos(rad) * 38];
  });
  const error = document.getElementById("error");
  let state = null;
  let drawn = "";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function cardEl(card) {
    if (!card) return el("div", "pcard empty");
    const red = card.suit === "hearts" || card.suit === "diamonds";
    const node = el("div", "pcard" + (red ? " red" : ""));
    node.append(el("span", "rank", card.rank === "T" ? "10" : card.rank), el("span", "suit", suits[card.suit] || card.suit));
    return node;
  }

  function place(node, spot) {
    node.style.left = spot[0] + "%";
    node.style.top = spot[1] + "%";
  }

  function draw() {
    if (!state) return;
    const next = JSON.stringify(state);
    if (next === drawn) return;
    drawn = next;
    const committed = (state.pots || []).reduce((sum, pot) => sum + pot.size, 0);
    const live = state.players.reduce((sum, player) => sum + player.betSize, 0);
    document.getElementById("info").textContent = "";
    document.getElementById("info").append(
      "Table ", el("code", "", state.id),
      " · password ", el("code", "", state.password),
      el("div", "meta", "Blinds " + state.smallBlind + "/" + state.bigBlind + " · buy-in " + state.buyIn),
    );
    const stage = document.getElementById("stage");
    stage.textContent = "";
    const rail = el("div", "rail");
    rail.append(el("div", "felt"));
    stage.append(rail);
    const center = el("div", "center");
    center.style.top = "48%";
    center.append(el("div", "pot", "Pot " + (committed + live)));
    const board = el("div", "board");
    for (let index = 0; index < 5; index += 1) board.append(cardEl(state.communityCards[index]));
    center.append(board, el("div", "meta", state.round || "waiting"));
    if (state.lastWinners.length) {
      center.append(el("div", "meta", state.lastWinners.map((winner) => winner.name + " +" + winner.amount).join("  ")));
    }
    stage.append(center);
    const bySeat = new Map(state.players.map((player) => [player.seat, player]));
    spots.forEach((spot, index) => {
      const player = bySeat.get(index);
      const seat = el("div", "seat");
      place(seat, spot);
      if (!player) {
        seat.append(el("div", "empty", "Seat " + (index + 1)));
        stage.append(seat);
        return;
      }
      if (player.id === state.playerToActId) seat.classList.add("turn");
      if (state.status === "playing" && !player.inHand) seat.classList.add("out");
      const holes = el("div", "holes");
      if (player.holeCards.length) {
        for (const card of player.holeCards) holes.append(cardEl(card));
      } else if (state.status === "playing" && !player.inHand) {
        holes.append(el("div", "empty", "folded"));
      } else {
        holes.append(cardEl(null), cardEl(null));
      }
      const plate = el("div", "plate");
      plate.append(holes, el("div", "name", player.name + (player.isAdmin ? " · admin" : "")), el("div", "stack", String(player.stack)));
      const ops = el("div", "ops");
      const rebuy = el("input");
      rebuy.type = "number";
      rebuy.min = "1";
      rebuy.max = String(state.buyIn);
      rebuy.value = String(state.buyIn);
      const buy = el("button", "ghost", "Rebuy");
      buy.type = "button";
      buy.onclick = () => send("/rebuy", { playerId: player.id, amount: Number(rebuy.value) });
      const admin = el("button", "ghost", "Admin");
      admin.type = "button";
      admin.disabled = player.isAdmin;
      admin.onclick = () => send("/admin", { playerId: player.id });
      const remove = el("button", "ghost", "Out");
      remove.type = "button";
      remove.onclick = () => send("/remove", { playerId: player.id });
      ops.append(rebuy, buy, admin, remove);
      plate.append(ops);
      seat.append(plate);
      stage.append(seat);
      if (player.betSize > 0) {
        const chip = el("div", "chip", String(player.betSize));
        place(chip, [spot[0] + (50 - spot[0]) * 0.38, spot[1] + (48 - spot[1]) * 0.38]);
        stage.append(chip);
      }
    });
    const actor = state.players.find((player) => player.id === state.playerToActId);
    document.getElementById("actor").textContent = actor ? actor.name + " to act" : "";
    const actions = document.getElementById("actions");
    actions.textContent = "";
    for (const action of state.legalActions) {
      const button = el("button", "", action);
      button.type = "button";
      button.onclick = () => send("/act", { action, amount: action === "bet" || action === "raise" ? Number(document.getElementById("amount").value) : undefined });
      actions.append(button);
    }
    const sizing = document.getElementById("sizing");
    sizing.textContent = "";
    if (state.chipRange) {
      const input = el("input");
      input.id = "amount";
      input.type = "number";
      input.min = state.chipRange.min;
      input.max = state.chipRange.max;
      input.value = state.chipRange.min;
      sizing.append(input, el("span", "meta", state.chipRange.min + "–" + state.chipRange.max));
    }
    document.getElementById("deal").disabled = state.status === "playing" || state.players.length < 2;
  }

  async function send(path, body) {
    error.textContent = "";
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json();
    if (!response.ok) {
      error.textContent = payload.error || "Failed";
      return;
    }
    state = payload;
    drawn = "";
    draw();
  }

  async function refresh() {
    const response = await fetch(base + "/state");
    if (!response.ok) return;
    state = await response.json();
    draw();
  }

  document.getElementById("add").onsubmit = (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name");
    send("/players", { name }).then(() => { event.target.reset(); });
  };
  document.getElementById("deal").onclick = () => send("/deal");
  document.getElementById("reset").onclick = () => {
    if (confirm("Clear every player and the current hand?")) send("/reset");
  };
  refresh();
  setInterval(refresh, 1000);
</script>`;
}
