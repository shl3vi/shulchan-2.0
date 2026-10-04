import { execFileSync, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const nvmDir = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`;
const node24 = execFileSync("bash", ["-lc", `source "${nvmDir}/nvm.sh" && nvm version 24`], {
  encoding: "utf8",
}).trim();
const nodeBin = `${nvmDir}/versions/node/${node24}/bin`;
const pathWithNode24 = `${nodeBin}:${process.env.PATH ?? ""}`;

function lanIp() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

const root = fileURLToPath(new URL("..", import.meta.url));
const children = [];

function start(command, args, name, env = process.env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...env, PATH: pathWithNode24 },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

const ip = lanIp();
await writeFile(
  new URL("../livekit.yaml", import.meta.url),
  `port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50010
  node_ip: ${ip}
keys:
  devkey: secret
`,
);

const docker = spawn("docker", ["compose", "up", "-d", "redis", "livekit"], { cwd: root, stdio: "inherit" });
const dockerCode = await new Promise((resolve) => docker.on("exit", resolve));
if (dockerCode !== 0) {
  console.error("Redis did not start. Docker needs to be running.");
  process.exit(1);
}

start("npm", ["run", "dev", "--prefix", "poker-engine"], "poker");
start("npm", ["run", "dev", "--prefix", "table"], "table", {
  ...process.env,
  LIVEKIT_URL: `ws://${ip}:7880`,
  LIVEKIT_API_KEY: "devkey",
  LIVEKIT_API_SECRET: "secret",
});

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
console.log(`\nPhones reach this Mac at ${url}`);
console.log("In another terminal, from client/: npx expo run:android\n");

await new Promise(() => {});
