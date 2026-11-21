import { z } from "zod";
import { readSchema } from "../../schema.js";
import { publishTable, readTable, withTable, type TableRecord } from "../../store.js";
import type { GameDebug } from "../types.js";
import { openingTiles, playTiles } from "./engine.js";
import { tilesLineup } from "./moves.js";
import { moveInputs, type TilesAction, type TilesSettings } from "./schema.js";
import { MIN_PLAYERS } from "./seats.js";
import { noteTilesWin, tilesActor, tilesOf } from "./state.js";

const debugBody = z.discriminatedUnion("type", [
  moveInputs.start.extend({ type: z.literal("start") }),
  moveInputs.play.extend({ type: z.literal("play") }),
  moveInputs.draw.extend({ type: z.literal("draw") }),
]);

/** The debug page sees every rack and the pool count, to play any seat. */
async function state(table: TableRecord) {
  const tiles = tilesOf(table);
  const play = tiles.play;
  return {
    id: table.id,
    password: table.password,
    kind: "tiles" as const,
    players: table.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      isAdmin: player.id === table.adminId,
    })),
    play: play ? { ...play, pool: undefined, poolCount: play.pool.length } : null,
    log: tiles.log,
  };
}

async function play(tableId: string, action: z.infer<typeof debugBody>) {
  await withTable(tableId, async (table) => {
    const tiles = tilesOf(table);
    if (action.type === "start") {
      const lineup = tilesLineup(table);
      if (lineup.length < MIN_PLAYERS) throw new Error("Seat two players first");
      tiles.play = await openingTiles(lineup);
      return;
    }
    const who = tilesActor(tiles.play);
    if (!tiles.play || !who) throw new Error("Start a game first");
    const previous = tiles.play;
    const next = await playTiles(previous, who, action as TilesAction);
    noteTilesWin(tiles, previous, next);
    tiles.play = next;
  });
  await publishTable(tableId);
}

export const tilesDebug: GameDebug<TilesSettings> = {
  path: "tiles",
  envPrefix: "DEBUG_TILES",
  label: "Tiles debug",
  settings: () => ({ settings: {} }),
  page: tilesPage,
  state,
  async repair(tableId) {
    if (!(await readTable(tableId))) throw new Error("Debug table missing");
  },
  async reset(table) {
    const tiles = tilesOf(table);
    tiles.play = null;
    tiles.log = [];
  },
  routes(router, respond) {
    router.post("/:token/play", async (req, res) => {
      const body = readSchema(debugBody, req.body);
      if (!body) {
        res.status(400).json({ error: "Unknown action" });
        return;
      }
      await respond(res, (tableId) => play(tableId, body));
    });
  },
};

function tilesPage() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tiles</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0d1424; color: #fafaf9; font: 14px/1.3 sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px 16px 160px; }
  .top, .ops, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .top { justify-content: space-between; }
  .meta { color: #a8a29e; }
  .error { color: #fca5a5; min-height: 1.2em; }
  code { color: #f6d36b; }
  button, input { font: inherit; }
  button { background: #f6d36b; color: #1c1917; border: 0; border-radius: 999px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
  button.ghost { background: #1c1917cc; color: #fafaf9; border: 1px solid #44403c; }
  input { background: #0c0a09; color: #fafaf9; border: 1px solid #44403c; border-radius: 8px; padding: 6px 8px; }
  .player { background: #111827ee; border: 1px solid #292524; border-radius: 12px; padding: 8px 10px; }
  .player.turn { border-color: #86e3c4; }
  .board { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; padding: 12px; border-radius: 16px; background: #123b33; min-height: 60px; }
  .set { display: flex; gap: 2px; padding: 4px; border-radius: 8px; background: #0003; }
  .tile { width: 26px; height: 36px; border-radius: 5px; background: #fbf6ea; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; }
  .r { color: #d9342b; } .b { color: #1f6fd1; } .o { color: #e88a12; } .k { color: #222; } .j { color: #b91c1c; }
  .rack { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
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
  <p id="status"></p>
  <div id="board" class="board"></div>
  <div id="players"></div>
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

  const isJoker = (tile) => tile[0] === "j";
  const num = (tile) => parseInt(tile.slice(1), 10);
  function tileNode(tile) {
    const node = document.createElement("span");
    node.className = "tile " + (isJoker(tile) ? "j" : tile[0]);
    node.textContent = isJoker(tile) ? "☺" : num(tile);
    return node;
  }

  /** Sets the rack can make on its own: groups of one number, and runs of one colour. */
  function ownSets(rack) {
    const left = rack.filter((tile) => !isJoker(tile));
    const sets = [];
    const byNumber = {};
    for (const tile of left) (byNumber[num(tile)] = byNumber[num(tile)] || []).push(tile);
    for (const tiles of Object.values(byNumber)) {
      const seen = {};
      const group = tiles.filter((tile) => !seen[tile[0]] && (seen[tile[0]] = true));
      if (group.length >= 3) sets.push(group);
    }
    const used = new Set(sets.flat());
    for (const color of ["r", "b", "o", "k"]) {
      const byN = {};
      for (const tile of left) if (tile[0] === color && !used.has(tile)) byN[num(tile)] = byN[num(tile)] || tile;
      let run = [];
      for (let n = 1; n <= 14; n += 1) {
        if (byN[n]) run.push(byN[n]);
        else { if (run.length >= 3) sets.push(run); run = []; }
      }
    }
    return sets;
  }

  function value(set) {
    const numbers = set.map(num);
    const group = numbers.every((n) => n === numbers[0]);
    return group ? numbers[0] * set.length : numbers.reduce((a, b) => a + b, 0);
  }

  /** Plays what the current player can lay down from their rack, or draws. */
  function autoPlay() {
    const play = state.play;
    const player = play.players[play.turn];
    const sets = ownSets(player.rack);
    const points = sets.reduce((total, set) => total + value(set), 0);
    if (sets.length === 0 || (!player.melded && points < 30)) return send("/play", { type: "draw" });
    send("/play", { type: "play", table: [...play.table, ...sets] });
  }

  function draw() {
    if (!state) return;
    const play = state.play;
    const info = document.getElementById("info");
    info.textContent = "";
    info.append("Table ", Object.assign(document.createElement("code"), { textContent: state.id }));
    info.append("  password ", Object.assign(document.createElement("code"), { textContent: state.password || "" }));
    const current = play && play.phase === "playing" ? play.players[play.turn] : null;
    document.getElementById("status").textContent = !play ? "no game" : play.phase === "over"
      ? "over · " + play.players.map((p) => p.name + " " + (play.points[p.id] || 0)).join(", ")
      : current.name + " to play · pool " + play.poolCount + (play.last ? " · last: " + play.last.kind : "");
    const board = document.getElementById("board");
    board.textContent = "";
    for (const set of play ? play.table : []) {
      const node = document.createElement("div");
      node.className = "set";
      set.forEach((tile) => node.append(tileNode(tile)));
      board.append(node);
    }
    const players = document.getElementById("players");
    players.textContent = "";
    for (const player of state.players) {
      const inGame = play && play.players.find((entry) => entry.id === player.id);
      const card = document.createElement("div");
      card.className = "player" + (current && current.id === player.id ? " turn" : "");
      card.style.marginBottom = "8px";
      const title = document.createElement("div");
      title.className = "row";
      title.append(player.name + (player.isAdmin ? " · admin" : "") + (inGame ? " · " + inGame.rack.length + " tiles" + (inGame.melded ? " · melded" : "") : ""));
      for (const [label, path] of [["Remove", "/remove"], ["Admin", "/admin"]]) {
        const button = document.createElement("button");
        button.className = "ghost";
        button.type = "button";
        button.textContent = label;
        button.onclick = () => send(path, { playerId: player.id });
        title.append(button);
      }
      card.append(title);
      if (inGame) {
        const rack = document.createElement("div");
        rack.className = "rack";
        inGame.rack.slice().sort().forEach((tile) => rack.append(tileNode(tile)));
        card.append(rack);
      }
      players.append(card);
    }
    const actions = document.getElementById("actions");
    actions.textContent = "";
    function action(label, run) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = run;
      actions.append(button);
    }
    if (current) {
      action("Auto play " + current.name, autoPlay);
      action("Draw", () => send("/play", { type: "draw" }));
    }
    action(play && play.phase === "playing" ? "Restart game" : "Start game", () => send("/play", { type: "start" }));
    const log = state.log || [];
    document.getElementById("log").textContent = log.slice(-6).map((entry) => entry.scores.map((line) => line.name + " " + line.points).join(", ")).join(" · ");
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
