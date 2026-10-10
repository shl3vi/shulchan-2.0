import { spawn } from "node:child_process";

const children = [];

function start(prefix, env) {
  const child = spawn("npm", ["start", "--prefix", prefix], {
    env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    for (const other of children) other.kill("SIGTERM");
    process.exit(code ?? 0);
  });
}

function shutdown() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start("poker-engine", process.env);
start("table", {
  ...process.env,
  POKER_ENGINE_URL: process.env.POKER_ENGINE_URL ?? "http://127.0.0.1:4001",
});
