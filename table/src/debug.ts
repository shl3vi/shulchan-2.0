import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { actPoker, addChips, createPokerTable, readPoker, seatPoker, startPoker, type ActionName } from "./engine.js";
import { playerName } from "./name.js";
import { assignAdmin, dropRemovedPlayers, releaseSeat } from "./players.js";
import { readSchema } from "./schema.js";
import { snapshot } from "./snapshot.js";
import { insertTable, publishTable, readTable, TableNotFound, withTable, type TableRecord } from "./store.js";

const MAX_SEATS = 9;

const addBody = z.object({ name: z.string() }).strict();
const playerBody = z.object({ playerId: z.string().min(1) }).strict();
const rebuyBody = z.object({ playerId: z.string().min(1), amount: z.number() }).strict();
const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: z.number().optional(),
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
  if (password !== null && password.length > 32) {
    console.error("Debug table is off. DEBUG_TABLE_PASSWORD is too long.");
    return null;
  }
  return { tableId, dashboardId, smallBlind, buyIn, password };
}

function tablePassword() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 900000 + 100000);
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
        if (await insertTable(table)) await createPokerTable(table.id, table.smallBlind);
      }
      const table = await readTable(config.tableId);
      if (!table) throw new Error("Debug table missing");
      if (config.password && table.password !== config.password) {
        await withTable(config.tableId, async (current) => {
          current.password = config.password!;
        });
      }
      try {
        await readPoker(config.tableId);
      } catch {
        await createPokerTable(config.tableId, table.smallBlind);
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
  const view = await readPoker(tableId);
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
  await createPokerTable(config.tableId, current.smallBlind);
  await withTable(config.tableId, async (table) => {
    table.players = [];
    delete table.adminId;
    delete table.adminSecret;
    table.joinAttempts = 0;
  });
  await publishTable(config.tableId);
}

async function addPlayer(config: DebugConfig, name: string) {
  await withTable(config.tableId, async (table) => {
    const taken = new Set(table.players.map((player) => player.seat));
    const seat = Array.from({ length: MAX_SEATS }, (_, index) => index).find((index) => !taken.has(index));
    if (seat === undefined) throw new Error("Table is full");
    const player = { id: crypto.randomUUID(), name, secret: crypto.randomUUID(), seat, bought: table.buyIn };
    await seatPoker(table.id, seat, table.buyIn);
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
    await addChips(config.tableId, seated.seat, amount);
    seated.bought = (seated.bought ?? table.buyIn) + amount;
  });
  await publishTable(config.tableId);
}

async function act(config: DebugConfig, action: ActionName, amount?: number) {
  const table = await readTable(config.tableId);
  if (!table) throw new TableNotFound();
  const view = await readPoker(config.tableId);
  const actor = view.playerToActSeat == null ? undefined : table.players.find((player) => player.seat === view.playerToActSeat);
  if (!actor) throw new Error("No action is open");
  await withTable(config.tableId, async (current) => {
    const seated = current.players.find((player) => player.id === actor.id);
    if (!seated) throw new Error("No action is open");
    await actPoker(config.tableId, seated.seat, action, amount);
    await dropRemovedPlayers(current);
  });
  await publishTable(config.tableId);
}

async function deal(config: DebugConfig) {
  await withTable(config.tableId, async (table) => {
    await startPoker(config.tableId);
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
  body { margin: 0; background: #07110d; color: #fafaf9; font: 15px/1.4 sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .card { background: #12211a; border: 1px solid #1f3a2e; border-radius: 12px; padding: 12px; margin-top: 12px; }
  .meta { color: #a8a29e; }
  button, input { font: inherit; }
  button { background: #f6d36b; color: #1c1917; border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
  button.ghost { background: transparent; color: #fafaf9; border: 1px solid #44403c; }
  button:disabled { opacity: 0.4; cursor: default; }
  input { background: #0c0a09; color: #fafaf9; border: 1px solid #44403c; border-radius: 8px; padding: 8px 10px; }
  .seat { display: grid; gap: 8px; }
  .turn { border-color: #f6d36b; }
  .red { color: #f87171; }
  .error { color: #fca5a5; min-height: 1.2em; }
  code { color: #f6d36b; }
</style>
<main>
  <h1>Debug table</h1>
  <p class="error" id="error"></p>
  <section class="card" id="info"></section>
  <section class="card">
    <div class="row">
      <button id="deal" type="button">Deal</button>
      <button id="reset" class="ghost" type="button">Reset table</button>
    </div>
    <div class="row" id="actions" style="margin-top:12px"></div>
    <div class="row" id="sizing"></div>
  </section>
  <section class="card">
    <form id="add" class="row">
      <input name="name" placeholder="Player name" maxlength="24" required>
      <button type="submit">Add player</button>
    </form>
  </section>
  <section id="seats"></section>
</main>
<script>
  const base = location.pathname.replace(/\\/$/, "");
  const suits = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const error = document.getElementById("error");
  let state = null;
  let drawn = "";

  function cards(list) {
    if (!list || !list.length) return "";
    return list.map((card) => {
      const red = card.suit === "hearts" || card.suit === "diamonds";
      const rank = card.rank === "T" ? "10" : card.rank;
      return '<span class="' + (red ? "red" : "") + '">' + rank + (suits[card.suit] || card.suit) + "</span>";
    }).join(" ");
  }

  function draw() {
    if (!state) return;
    const next = JSON.stringify(state);
    if (next === drawn) return;
    drawn = next;
    const pot = (state.pots || []).reduce((sum, pot) => sum + pot.size, 0);
    document.getElementById("info").innerHTML =
      "<div>Table <code>" + escapeText(state.id) + "</code> · password <code>" + escapeText(state.password) + "</code></div>" +
      "<div class='meta'>Blinds " + state.smallBlind + "/" + state.bigBlind + " · buy-in " + state.buyIn +
      " · " + (state.round || "waiting") + " · pot " + pot + "</div>" +
      "<div>Board " + (cards(state.communityCards) || "—") + "</div>" +
      (state.lastWinners.length ? "<div class='meta'>Last winners: " + state.lastWinners.map((winner) => escapeText(winner.name) + " +" + winner.amount).join(", ") + "</div>" : "");
    document.getElementById("deal").disabled = state.status === "playing" || state.players.length < 2;
    const actions = document.getElementById("actions");
    actions.innerHTML = "";
    const actor = state.players.find((player) => player.id === state.playerToActId);
    if (actor) {
      const label = document.createElement("span");
      label.className = "meta";
      label.textContent = actor.name + " to act";
      actions.appendChild(label);
    }
    for (const action of state.legalActions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action;
      button.onclick = () => send("/act", { action, amount: action === "bet" || action === "raise" ? Number(document.getElementById("amount").value) : undefined });
      actions.appendChild(button);
    }
    const sizing = document.getElementById("sizing");
    sizing.innerHTML = "";
    if (state.chipRange) {
      const input = document.createElement("input");
      input.id = "amount";
      input.type = "number";
      input.min = state.chipRange.min;
      input.max = state.chipRange.max;
      input.value = state.chipRange.min;
      sizing.appendChild(input);
      const hint = document.createElement("span");
      hint.className = "meta";
      hint.textContent = state.chipRange.min + "–" + state.chipRange.max;
      sizing.appendChild(hint);
    }
    const seats = document.getElementById("seats");
    seats.innerHTML = "";
    for (const player of state.players) {
      const seat = document.createElement("section");
      seat.className = "card seat" + (player.id === state.playerToActId ? " turn" : "");
      const title = document.createElement("div");
      title.innerHTML = "<strong>" + escapeText(player.name) + "</strong> · seat " + (player.seat + 1) +
        " · stack " + player.stack + " · bet " + player.betSize +
        (player.isAdmin ? " · admin" : "") + (player.inHand ? "" : " · sitting out");
      const holes = document.createElement("div");
      holes.innerHTML = cards(player.holeCards) || "<span class='meta'>No cards</span>";
      const controls = document.createElement("div");
      controls.className = "row";
      const rebuy = document.createElement("input");
      rebuy.type = "number";
      rebuy.min = "1";
      rebuy.max = String(state.buyIn);
      rebuy.value = String(state.buyIn);
      const buy = document.createElement("button");
      buy.type = "button";
      buy.textContent = "Rebuy";
      buy.onclick = () => send("/rebuy", { playerId: player.id, amount: Number(rebuy.value) });
      const admin = document.createElement("button");
      admin.type = "button";
      admin.className = "ghost";
      admin.textContent = "Make admin";
      admin.disabled = player.isAdmin;
      admin.onclick = () => send("/admin", { playerId: player.id });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost";
      remove.textContent = "Remove";
      remove.onclick = () => send("/remove", { playerId: player.id });
      controls.append(rebuy, buy, admin, remove);
      seat.append(title, holes, controls);
      seats.appendChild(seat);
    }
  }

  function escapeText(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
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
