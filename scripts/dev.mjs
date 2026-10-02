import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const children = [];

function start(command, args, name) {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tag = `[${name}]`;
  child.stdout.on("data", (chunk) => process.stdout.write(`${tag} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${tag} ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${tag} exited ${code}`);
      shutdown();
    }
  });
  return child;
}

function shutdown() {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const docker = spawn("docker", ["compose", "up", "-d", "redis"], { cwd: root, stdio: "inherit" });
const dockerCode = await new Promise((resolve) => docker.on("exit", resolve));
if (dockerCode !== 0) {
  console.error("Redis did not start. Docker needs to be running.");
  process.exit(1);
}

start("npm", ["run", "dev", "--prefix", "poker-engine"], "poker");
start("npm", ["run", "dev", "--prefix", "table"], "table");

const tunnel = start("cloudflared", ["tunnel", "--url", "http://127.0.0.1:4000"], "tunnel");
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cloudflared did not print a URL")), 30000);
  const onData = (chunk) => {
    const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!match) return;
    clearTimeout(timer);
    tunnel.stdout.off("data", onData);
    tunnel.stderr.off("data", onData);
    resolve(match[0]);
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);
});

await writeFile(new URL("../client/.env", import.meta.url), `EXPO_PUBLIC_API_URL=${url}\n`);
for (const stream of [tunnel.stdout, tunnel.stderr]) {
  stream.removeAllListeners("data");
  stream.on("data", () => {});
}
console.log(`\nPhones reach this Mac at ${url}\n`);

const expo = spawn("npx", ["expo", "start", "--tunnel"], {
  cwd: fileURLToPath(new URL("../client/", import.meta.url)),
  stdio: "inherit",
});
children.push(expo);
await new Promise((resolve) => expo.on("exit", resolve));
shutdown();
