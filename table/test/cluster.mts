import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { attachCluster } from "../src/cluster.ts";
import { pool } from "../src/db.ts";
import { redis } from "../src/store.ts";

await redis.connect();

async function listen(port: number) {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  await new Promise<void>((resolve) => http.listen(port, "127.0.0.1", () => resolve()));
  const closeCluster = await attachCluster(io);
  io.on("connection", (socket) => {
    socket.on("join", async (room: string, ack: () => void) => {
      await socket.join(room);
      ack();
    });
  });
  return {
    io,
    close: async () => {
      io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await closeCluster();
    },
  };
}

function phone(port: number) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function once(socket: Socket, event: string) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} was not delivered to a phone on the other process`)), 3000);
    socket.once(event, (body: string) => {
      clearTimeout(timer);
      resolve(body);
    });
  });
}

const left = await listen(4191);
const right = await listen(4192);
const phoneA = await phone(4191);
const phoneB = await phone(4192);
await new Promise<void>((resolve) => phoneA.emit("join", "table-1", () => resolve()));
await new Promise<void>((resolve) => phoneB.emit("join", "table-1", () => resolve()));

const heard = Promise.all([once(phoneA, "state"), once(phoneB, "state")]);
left.io.to("table-1").emit("state", "from-left");
const [onA, onB] = await heard;
assert.equal(onA, "from-left");
assert.equal(onB, "from-left");

phoneA.close();
phoneB.close();
await left.close();
await right.close();
await redis.quit();
await pool.end();
console.log("Two table processes shared one room");
