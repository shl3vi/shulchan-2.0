import { z } from "zod";
import { readSchema } from "../../schema.js";
import { publishTable, readTable, TableNotFound, withTable, type TableRecord } from "../../store.js";
import type { GameDebug } from "../types.js";
import { dropRemovedPlayers } from "./departures.js";
import { actPoker, addChips, openHand, readPoker, startPoker, type ActionName } from "./engine.js";
import { blindsProblem, chipAmount, MAX_CHIPS, type PokerSettings } from "./schema.js";
import { pokerView } from "./view.js";
import { pokerOf } from "./state.js";

const rebuyBody = z.object({ playerId: z.string().min(1), amount: chipAmount }).strict();
const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: chipAmount.optional(),
}).strict();

/** The debug table's blinds and buy-in, from its environment variables. */
function debugBlinds(read: (name: string) => string | undefined): { settings: PokerSettings } | { error: string } {
  const smallBlind = Number(read("SMALL_BLIND") ?? 1);
  const buyIn = Number(read("BUY_IN") ?? 100);
  if (blindsProblem(smallBlind, buyIn)) return { error: "Check the SMALL_BLIND and BUY_IN table settings." };
  return { settings: { smallBlind, buyIn } };
}

/** A debug table whose hand the engine no longer reads gets a new one. */
async function repairPokerHand(tableId: string) {
  const table = await readTable(tableId);
  if (!table) throw new Error("Debug table missing");
  try {
    await readPoker(table);
  } catch {
    await withTable(tableId, async (current) => {
      const state = pokerOf(current);
      await openHand(state, state.smallBlind);
    });
  }
}

async function state(table: TableRecord) {
  const view = await readPoker(table);
  const { status, game } = pokerView(table, view);
  const holes = new Map(view.holeCards.map((entry) => [entry.seat, entry.cards]));
  return {
    id: table.id,
    password: table.password,
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    buyIn: game.buyIn,
    status: status.phase,
    round: game.round,
    communityCards: game.communityCards,
    pots: game.pots,
    legalActions: view.legalActions,
    chipRange: view.chipRange,
    playerToActId: status.toAct[0] ?? null,
    lastWinners: game.lastWinners,
    players: table.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      ...game.seats[player.id],
      isAdmin: player.id === table.adminId,
      holeCards: holes.get(player.seat) ?? game.shownCards.find((shown) => shown.seat === player.seat)?.cards ?? [],
    })),
  };
}

async function rebuy(tableId: string, playerId: string, amount: number) {
  await withTable(tableId, async (table) => {
    const state = pokerOf(table);
    if (!Number.isInteger(amount) || amount < 1 || amount > state.buyIn) {
      throw new Error("Buy-in must be a whole number up to the table buy-in");
    }
    const seated = table.players.find((player) => player.id === playerId && !player.pendingRemoval);
    if (!seated) throw new Error("Player not found");
    await addChips(table, seated.seat, amount);
    state.bought[seated.id] = (state.bought[seated.id] ?? state.buyIn) + amount;
  });
  await publishTable(tableId);
}

async function act(tableId: string, action: ActionName, amount?: number) {
  if ((action === "bet" || action === "raise") && (amount == null || !Number.isInteger(amount) || amount < 1 || amount > MAX_CHIPS)) {
    throw new Error("Bet size is outside the allowed range");
  }
  const table = await readTable(tableId);
  if (!table) throw new TableNotFound();
  const view = await readPoker(table);
  const actor = view.playerToActSeat == null ? undefined : table.players.find((player) => player.seat === view.playerToActSeat);
  if (!actor) throw new Error("No action is open");
  await withTable(tableId, async (current) => {
    const seated = current.players.find((player) => player.id === actor.id);
    if (!seated) throw new Error("No action is open");
    await actPoker(current, seated.seat, action, amount);
    await dropRemovedPlayers(current);
  });
  await publishTable(tableId);
}

async function deal(tableId: string) {
  await withTable(tableId, async (table) => {
    await startPoker(table);
    await dropRemovedPlayers(table);
  });
  await publishTable(tableId);
}

export const pokerDebug: GameDebug<PokerSettings> = {
  path: "dashboard",
  envPrefix: "DEBUG",
  label: "Debug",
  settings: debugBlinds,
  page: pokerPage,
  state,
  repair: repairPokerHand,
  async reset(table) {
    const state = pokerOf(table);
    state.bought = {};
    delete state.turn;
    delete state.autoDealAt;
    await openHand(state, state.smallBlind);
  },
  routes(router, respond) {
    router.post("/:token/rebuy", async (req, res) => {
      const body = readSchema(rebuyBody, req.body);
      if (!body) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      await respond(res, (tableId) => rebuy(tableId, body.playerId, body.amount));
    });

    router.post("/:token/act", async (req, res) => {
      const body = readSchema(actBody, req.body);
      if (!body) {
        res.status(400).json({ error: "Unknown action" });
        return;
      }
      await respond(res, (tableId) => act(tableId, body.action, body.amount));
    });

    router.post("/:token/deal", async (_req, res) => {
      await respond(res, (tableId) => deal(tableId));
    });
  },
};

function pokerPage() {
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
  <button id="open" type="button">Open table</button>
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
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      error.textContent = payload.error || "Table is closed";
      return;
    }
    error.textContent = "";
    state = payload;
    draw();
  }

  document.getElementById("add").onsubmit = (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name");
    send("/players", { name }).then(() => { event.target.reset(); });
  };
  document.getElementById("open").onclick = () => send("/open");
  document.getElementById("deal").onclick = () => send("/deal");
  document.getElementById("reset").onclick = () => {
    if (confirm("Clear every player and the current hand?")) send("/reset");
  };
  refresh();
  setInterval(refresh, 1000);
</script>`;
}
