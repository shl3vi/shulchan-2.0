import { spawn } from "node:child_process";

// Production runs this process as the table only. Each game's engine is its own service;
// POKER_ENGINE_URL, BACKGAMMON_ENGINE_URL, DICE_ENGINE_URL, TILES_ENGINE_URL and ENGINE_TOKEN come from the environment.
const child = spawn("npm", ["start", "--prefix", "table"], {
  env: process.env,
  stdio: "inherit",
});

function shutdown() {
  child.kill("SIGTERM");
}

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
