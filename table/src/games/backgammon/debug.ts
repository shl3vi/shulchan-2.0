import { readSchema } from "../../schema.js";
import { publishTable, readTable, withTable, type TableRecord } from "../../store.js";
import type { GameDebug } from "../types.js";
import { backgammonMoves as legalMoves, openingBackgammon, playBackgammon } from "./engine.js";
import { backgammonBody, type BackgammonAction, type BackgammonSettings } from "./schema.js";
import { backgammonOf, colorOf, settledColors } from "./state.js";

async function state(table: TableRecord) {
  const game = backgammonOf(table).board;
  let moves: Awaited<ReturnType<typeof legalMoves>> = [];
  if (game) {
    try {
      moves = await legalMoves(game);
    } catch {
      moves = [];
    }
  }
  const colors = settledColors(table);
  return {
    id: table.id,
    password: table.password,
    kind: "backgammon" as const,
    players: table.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      isAdmin: player.id === table.adminId,
      color: colorOf(colors, player.id),
    })),
    game: game ?? null,
    moves,
    log: backgammonOf(table).log,
  };
}

/** The debug page plays for whoever is to act. */
function actor(table: TableRecord, action: BackgammonAction) {
  const colors = settledColors(table);
  const game = backgammonOf(table).board as { phase?: string; turn?: "white" | "black" } | undefined;
  if (action.type === "restart" || !game || game.phase === "over") return table.adminId ?? colors.white ?? null;
  const color = game.phase === "offer" ? (game.turn === "white" ? "black" : "white") : game.turn;
  return (color === "black" ? colors.black : colors.white) ?? null;
}

async function play(tableId: string, action: BackgammonAction) {
  await withTable(tableId, async (table) => {
    const who = actor(table, action);
    if (!who) throw new Error("Seat the players first");
    await playBackgammon(table, who, action);
  });
  await publishTable(tableId);
}

export const backgammonDebug: GameDebug<BackgammonSettings> = {
  path: "backgammon",
  envPrefix: "DEBUG_BG",
  label: "Backgammon debug",
  settings: () => ({ settings: {} }),
  page: backgammonPage,
  state,
  async repair(tableId) {
    const table = await readTable(tableId);
    if (!table) throw new Error("Debug table missing");
    if (backgammonOf(table).board) return;
    await withTable(tableId, async (current) => {
      backgammonOf(current).board = await openingBackgammon();
    });
  },
  async reset(table) {
    const state = backgammonOf(table);
    state.board = await openingBackgammon();
    state.log = [];
    state.colors = {};
  },
  routes(router, respond) {
    router.post("/:token/play", async (req, res) => {
      const body = readSchema(backgammonBody, req.body);
      if (!body) {
        res.status(400).json({ error: "Unknown action" });
        return;
      }
      await respond(res, (tableId) => play(tableId, body));
    });
  },
};

function backgammonPage() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backgammon</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #1a120c; color: #fafaf9; font: 14px/1.3 sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 16px 16px 140px; }
  .top, .ops, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .top { justify-content: space-between; }
  .meta, .empty { color: #a8a29e; }
  .error { color: #fca5a5; min-height: 1.2em; }
  code { color: #f6d36b; }
  button, input { font: inherit; }
  button { background: #f6d36b; color: #1c1917; border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
  button.ghost { background: #1c1917cc; color: #fafaf9; border: 1px solid #44403c; }
  input { background: #0c0a09; color: #fafaf9; border: 1px solid #44403c; border-radius: 8px; padding: 6px 8px; }
  .board { display: flex; flex-direction: column; gap: 28px; margin-top: 12px; background: #5c3317; border: 3px solid #f6d36b; border-radius: 16px; padding: 12px; }
  .half { display: grid; grid-template-columns: repeat(6, 1fr) 64px repeat(6, 1fr) 28px; min-height: 176px; }
  .point { position: relative; display: flex; flex-direction: column; align-items: center; min-height: 176px; }
  .point.down { justify-content: flex-start; }
  .point.up { justify-content: flex-end; }
  .point::before { content: ""; position: absolute; left: 12%; right: 12%; height: 74%; }
  .point.down::before { top: 0; clip-path: polygon(50% 100%, 0 0, 100% 0); }
  .point.up::before { bottom: 0; clip-path: polygon(50% 0, 0 100%, 100% 100%); }
  .point.odd::before { background: #7f1d1d; }
  .point.even::before { background: #1a6b78; }
  .bar { margin: 0 18px; border-radius: 4px; background: #3f2412; display: flex; flex-direction: column; align-items: center; }
  .bar.far { justify-content: flex-start; padding-top: 6px; }
  .bar.near { justify-content: flex-end; padding-bottom: 6px; }
  .off { display: flex; flex-direction: column; align-items: center; }
  .off.far { justify-content: flex-start; padding-top: 4px; }
  .off.near { justify-content: flex-end; padding-bottom: 4px; }
  .stack { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
  .point.down .stack, .off.far .stack, .bar.far .stack { padding-top: 4px; }
  .point.up .stack, .off.near .stack, .bar.near .stack { padding-bottom: 4px; }
  .checker { width: 22px; height: 22px; border-radius: 50%; display: block; flex: none; box-sizing: border-box; }
  .checker.white { background: radial-gradient(circle at 35% 32%, #fff, #f5f0e6 42%, #cfc6b8); border: 1px solid #d6d3d1; box-shadow: inset 0 0 0 3px #efe4d2; }
  .checker.black { background: radial-gradient(circle at 35% 32%, #57534e, #1c1917 46%, #0c0a09); border: 1px solid #f6d36b; box-shadow: inset 0 0 0 3px #292524; }
  .player { background: #111827ee; border: 1px solid #292524; border-radius: 12px; padding: 8px 10px; }
  .player.turn { border-color: #f6d36b; }
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
  <div id="players" class="ops"></div>
  <p id="status"></p>
  <div id="board" class="board"></div>
  <p id="log" class="meta"></p>
</main>
<div class="dock">
  <span id="actions" class="ops"></span>
  <button id="open" type="button">Open table</button>
  <button id="reset" class="ghost" type="button">Reset</button>
</div>
<script>
  const base = location.pathname.replace(/\\/$/, "");
  const error = document.getElementById("error");
  let state = null;

  function send(path, body) {
    error.textContent = "";
    return fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        error.textContent = payload.error || "Failed";
        return;
      }
      state = payload;
      draw();
    }).catch(() => { error.textContent = "Failed"; });
  }

  function stack(count, color) {
    const node = document.createElement("div");
    node.className = "stack";
    const gap = count <= 1 ? 0 : Math.min(3, (148 - 22) / (count - 1) - 22);
    for (let index = 0; index < count; index += 1) {
      const checker = document.createElement("i");
      checker.className = "checker " + color;
      if (index > 0) checker.style.marginTop = gap + "px";
      node.append(checker);
    }
    return node;
  }

  function point(number, up) {
    const count = state.game && state.game.points ? state.game.points[number - 1] || 0 : 0;
    const node = document.createElement("div");
    node.className = "point " + (up ? "up" : "down") + (number % 2 === 0 ? " even" : " odd");
    if (count !== 0) node.append(stack(Math.abs(count), count > 0 ? "white" : "black"));
    return node;
  }

  function draw() {
    if (!state) return;
    const game = state.game || {};
    const info = document.getElementById("info");
    info.textContent = "";
    info.append("Table ", Object.assign(document.createElement("code"), { textContent: state.id }));
    info.append("  password ", Object.assign(document.createElement("code"), { textContent: state.password || "" }));
    const players = document.getElementById("players");
    players.textContent = "";
    const turn = game.phase === "offer" ? (game.turn === "white" ? "black" : "white") : game.turn;
    for (const player of state.players) {
      const card = document.createElement("div");
      card.className = "player" + (player.color && player.color === turn ? " turn" : "");
      const title = document.createElement("div");
      title.textContent = player.name + (player.color ? " · " + player.color : "") + (player.isAdmin ? " · admin" : "");
      const ops = document.createElement("div");
      ops.className = "ops";
      const remove = document.createElement("button");
      remove.className = "ghost";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.onclick = () => send("/remove", { playerId: player.id });
      const admin = document.createElement("button");
      admin.className = "ghost";
      admin.type = "button";
      admin.textContent = "Admin";
      admin.onclick = () => send("/admin", { playerId: player.id });
      ops.append(remove, admin);
      card.append(title, ops);
      players.append(card);
    }
    const dice = (game.dice || []).join(" ");
    const cube = game.cube ? "cube " + game.cube + (game.cubeOwner ? " (" + game.cubeOwner + ")" : "") : "cube 1";
    document.getElementById("status").textContent = [
      game.phase || "no game",
      game.turn ? game.turn + " to play" : "",
      dice ? "dice " + dice : "",
      cube,
      game.message || "",
      game.winner ? "winner " + game.winner + " +" + (game.score || 0) : "",
    ].filter(Boolean).join(" · ");
    const board = document.getElementById("board");
    board.textContent = "";
    const top = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const bottom = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    function half(numbers, up, barColor, barCount, offCount) {
      const row = document.createElement("div");
      row.className = "half";
      numbers.slice(0, 6).forEach((number) => row.append(point(number, up)));
      const bar = document.createElement("div");
      bar.className = "bar " + (up ? "near" : "far");
      if (barCount > 0) bar.append(stack(barCount, barColor));
      row.append(bar);
      numbers.slice(6).forEach((number) => row.append(point(number, up)));
      const off = document.createElement("div");
      off.className = "off " + (up ? "near" : "far");
      if (offCount > 0) off.append(stack(offCount, up ? "white" : "black"));
      row.append(off);
      board.append(row);
    }
    half(top, false, "black", (game.bar && game.bar.black) || 0, (game.off && game.off.black) || 0);
    half(bottom, true, "white", (game.bar && game.bar.white) || 0, (game.off && game.off.white) || 0);
    const actions = document.getElementById("actions");
    actions.textContent = "";
    function action(label, body) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = () => send("/play", body);
      actions.append(button);
    }
    if (game.phase === "opening" || game.phase === "roll") action("Roll", { type: "roll" });
    if (game.phase === "roll") action("Double", { type: "double" });
    if (game.phase === "offer") {
      action("Accept", { type: "answer", accept: true });
      action("Pass", { type: "answer", accept: false });
    }
    for (const move of state.moves || []) {
      const from = move.from === "bar" ? "bar" : String(move.from);
      const to = move.to === "off" ? "off" : String(move.to);
      action(from + " → " + to + " (" + move.die + ")", { type: "move", from: move.from, to: move.to, die: move.die });
    }
    action("Restart", { type: "restart" });
    const log = state.log || [];
    document.getElementById("log").textContent = log.length
      ? log.slice(-6).map((entry) => entry.winner + " +" + entry.points).join(" · ")
      : "";
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
  document.getElementById("reset").onclick = () => {
    if (confirm("Clear every player and start a new game?")) send("/reset");
  };
  refresh();
  setInterval(refresh, 2000);
</script>`;
}

