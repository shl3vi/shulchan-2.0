import { z } from "zod";
import { readSchema } from "../../schema.js";
import { publishTable, readTable, withTable, type TableRecord } from "../../store.js";
import type { GameDebug } from "../types.js";
import { openingDice, playDice } from "./engine.js";
import { diceLineup } from "./moves.js";
import { moveInputs, type DiceAction, type DiceSettings } from "./schema.js";
import { diceActor, diceOf, noteDiceWin } from "./state.js";

const debugBody = z.discriminatedUnion("type", [
  moveInputs.start.extend({ type: z.literal("start") }),
  moveInputs.roll.extend({ type: z.literal("roll") }),
  moveInputs.hold.extend({ type: z.literal("hold") }),
  moveInputs.score.extend({ type: z.literal("score") }),
]);

async function state(table: TableRecord) {
  const dice = diceOf(table);
  return {
    id: table.id,
    password: table.password,
    kind: "dice" as const,
    players: table.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      isAdmin: player.id === table.adminId,
    })),
    play: dice.play,
    log: dice.log,
  };
}

/** The debug page plays for whoever is to act, and starts a game for everyone seated. */
async function play(tableId: string, action: z.infer<typeof debugBody>) {
  await withTable(tableId, async (table) => {
    const dice = diceOf(table);
    if (action.type === "start") {
      const lineup = diceLineup(table);
      if (lineup.length === 0) throw new Error("Seat a player first");
      const previous = dice.play;
      dice.play = await openingDice(lineup);
      if (previous) noteDiceWin(dice, previous, dice.play);
      return;
    }
    const who = diceActor(dice.play);
    if (!dice.play || !who) throw new Error("Start a game first");
    const previous = dice.play;
    const next = await playDice(previous, who, action as DiceAction);
    noteDiceWin(dice, previous, next);
    dice.play = next;
  });
  await publishTable(tableId);
}

export const diceDebug: GameDebug<DiceSettings> = {
  path: "dice",
  envPrefix: "DEBUG_DICE",
  label: "Dice debug",
  settings: () => ({ settings: {} }),
  page: dicePage,
  state,
  async repair(tableId) {
    if (!(await readTable(tableId))) throw new Error("Debug table missing");
  },
  async reset(table) {
    const dice = diceOf(table);
    dice.play = null;
    dice.log = [];
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

function dicePage() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dice</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b1d19; color: #fafaf9; font: 14px/1.3 sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 16px 16px 160px; }
  .top, .ops { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
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
  .tray { display: flex; gap: 12px; margin: 14px 0; padding: 16px; border-radius: 18px; background: radial-gradient(ellipse at 50% 30%, #1d6b58, #0b2c25); border: 3px solid #6b4a26; }
  .die { width: 54px; height: 54px; border-radius: 12px; background: #fbf6ea; color: #201a2e; font-size: 28px; font-weight: 900; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 3px solid transparent; }
  .die.held { border-color: #f6d36b; transform: translateY(-6px); }
  table { border-collapse: collapse; margin-top: 10px; width: 100%; }
  th, td { border-bottom: 1px solid #23302c; padding: 4px 8px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  td.open { color: #73758b; }
  td.pick { color: #f6d36b; cursor: pointer; font-weight: 700; }
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
  <div id="tray" class="tray"></div>
  <div id="card"></div>
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
  const CATS = ["ones","twos","threes","fours","fives","sixes","threeKind","fourKind","fullHouse","smallStraight","largeStraight","fiveKind","chance"];
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

  function score(category, dice, player) {
    const n = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach((face) => { n[face] += 1; });
    const most = Math.max(...n);
    const joker = most === 5 && player.scores.fiveKind !== undefined;
    const sum = dice.reduce((a, b) => a + b, 0);
    const run = (length) => {
      const faces = new Set(dice);
      for (let start = 1; start + length - 1 <= 6; start += 1) {
        let ok = true;
        for (let face = start; face < start + length; face += 1) if (!faces.has(face)) ok = false;
        if (ok) return true;
      }
      return false;
    };
    const upper = CATS.indexOf(category);
    if (upper < 6) return n[upper + 1] * (upper + 1);
    return { threeKind: most >= 3 ? sum : 0, fourKind: most >= 4 ? sum : 0, fullHouse: joker || (n.includes(3) && n.includes(2)) ? 25 : 0,
      smallStraight: joker || run(4) ? 30 : 0, largeStraight: joker || run(5) ? 40 : 0, fiveKind: most === 5 ? 50 : 0, chance: sum }[category];
  }

  function draw() {
    if (!state) return;
    const play = state.play;
    const info = document.getElementById("info");
    info.textContent = "";
    info.append("Table ", Object.assign(document.createElement("code"), { textContent: state.id }));
    info.append("  password ", Object.assign(document.createElement("code"), { textContent: state.password || "" }));
    const current = play && play.phase === "playing" ? play.players[play.turn] : null;
    const players = document.getElementById("players");
    players.textContent = "";
    for (const player of state.players) {
      const card = document.createElement("div");
      card.className = "player" + (current && current.id === player.id ? " turn" : "");
      const inGame = play && play.players.find((entry) => entry.id === player.id);
      const title = document.createElement("div");
      title.textContent = player.name + (player.isAdmin ? " · admin" : "") + (inGame ? " · " + (inGame.total || 0) : "");
      const ops = document.createElement("div");
      ops.className = "ops";
      for (const [label, path] of [["Remove", "/remove"], ["Admin", "/admin"]]) {
        const button = document.createElement("button");
        button.className = "ghost";
        button.type = "button";
        button.textContent = label;
        button.onclick = () => send(path, { playerId: player.id });
        ops.append(button);
      }
      card.append(title, ops);
      players.append(card);
    }
    document.getElementById("status").textContent = !play ? "no game" : play.phase === "over"
      ? "over · winners " + play.winners.map((id) => (play.players.find((p) => p.id === id) || {}).name).join(", ")
      : current.name + " to play · rolls left " + play.rollsLeft;
    const tray = document.getElementById("tray");
    tray.textContent = "";
    const rolled = play && play.rollsLeft < 3;
    (play ? play.dice : []).forEach((face, index) => {
      const die = document.createElement("div");
      die.className = "die" + (rolled && play.held[index] ? " held" : "");
      die.textContent = rolled ? face : "·";
      die.onclick = () => {
        if (!rolled || play.rollsLeft === 0) return;
        const held = play.held.map((value, at) => (at === index ? !value : value));
        send("/play", { type: "hold", held });
      };
      tray.append(die);
    });
    const card = document.getElementById("card");
    card.textContent = "";
    if (play) {
      const table = document.createElement("table");
      const head = document.createElement("tr");
      head.append(Object.assign(document.createElement("th"), { textContent: "Box" }));
      play.players.forEach((player) => head.append(Object.assign(document.createElement("th"), { textContent: player.name + (player.left ? " (left)" : "") })));
      table.append(head);
      for (const category of CATS) {
        const row = document.createElement("tr");
        row.append(Object.assign(document.createElement("td"), { textContent: category }));
        play.players.forEach((player, index) => {
          const cell = document.createElement("td");
          const value = player.scores[category];
          if (value !== undefined) cell.textContent = value;
          else if (current && index === play.turn && rolled) {
            cell.className = "pick";
            cell.textContent = score(category, play.dice, player);
            cell.onclick = () => send("/play", { type: "score", category });
          } else cell.className = "open";
          row.append(cell);
        });
        table.append(row);
      }
      const total = document.createElement("tr");
      total.append(Object.assign(document.createElement("th"), { textContent: "Total" }));
      play.players.forEach((player) => total.append(Object.assign(document.createElement("th"), { textContent: player.total || 0 })));
      table.append(total);
      card.append(table);
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
    if (current && play.rollsLeft > 0) action("Roll", () => send("/play", { type: "roll" }));
    if (current && rolled) {
      action("Score best", () => {
        const open = CATS.filter((category) => current.scores[category] === undefined);
        const best = open.sort((a, b) => score(b, play.dice, current) - score(a, play.dice, current))[0];
        send("/play", { type: "score", category: best });
      });
    }
    action(play && play.phase === "playing" ? "Restart game" : "Start game", () => send("/play", { type: "start" }));
    const log = state.log || [];
    document.getElementById("log").textContent = log.slice(-6).map((entry) => entry.scores.map((line) => line.name + " " + line.total).join(", ")).join(" · ");
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
