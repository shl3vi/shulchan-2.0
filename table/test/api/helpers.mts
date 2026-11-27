/** Helpers for the API tests. `run.mts` starts the stack and sets API_URL, API_REDIS_URL and API_DATABASE_URL. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after } from "node:test";
import pg from "pg";
import { createClient } from "redis";
import { io as connect, type Socket } from "socket.io-client";

export const API = process.env.API_URL ?? "";
if (!API) throw new Error("Run the API tests with `npm run test:api`, which starts the server first");

export const redis = createClient({ url: process.env.API_REDIS_URL });
await redis.connect();
export const db = new pg.Pool({ connectionString: process.env.API_DATABASE_URL, max: 2 });

const sockets: Socket[] = [];
after(async () => {
  for (const socket of sockets) socket.disconnect();
  await redis.quit();
  await db.end();
});

let lastIp = 0;
/** A client address no other request has used, so per-address limits don't leak between tests. */
export function newIp() {
  lastIp += 1;
  const n = (process.pid * 1000 + lastIp) % 16_000_000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

type CallOptions = { method?: string; body?: unknown; headers?: Record<string, string>; ip?: string; redirect?: RequestRedirect };

export async function call(path: string, options: CallOptions = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      "x-forwarded-for": options.ip ?? newIp(),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: options.redirect ?? "follow",
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text };
}

/** A signed-in host, as the server stores one after Google or Apple sign-in. */
export async function signedInHost(email = `host-${randomUUID()}@example.com`) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO host_sessions (token_hash, sub, email, name, expires_at) VALUES ($1, $2, $3, $4, now() + interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), `google:${randomUUID()}`, email, "Test Host"],
  );
  return { token, email, auth: { authorization: `Bearer ${token}` } };
}

/** What the app keeps for PKCE: the verifier, and the challenge it sends to /auth/google. */
export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export type Opened = { gameId: string; adminSecret: string; password: string; host: Awaited<ReturnType<typeof signedInHost>> };

export async function openTable(settings: Record<string, unknown> = { kind: "poker", smallBlind: 5, buyIn: 500 }): Promise<Opened> {
  const host = await signedInHost();
  const response = await call("/api/games", { body: settings, headers: host.auth });
  if (response.status !== 201) throw new Error(`open table: ${response.status} ${response.text}`);
  return { ...response.json, host };
}

export type Seat = { id: string; secret: string; personKey: string; name: string };

export async function join(table: { gameId: string; password: string }, name: string, extra: Record<string, unknown> = {}, options: CallOptions = {}): Promise<Seat> {
  const personKey = randomUUID();
  const response = await call(`/api/games/${table.gameId}/join`, {
    ...options,
    body: { name, password: table.password, personKey, ...extra },
  });
  if (response.status !== 201) throw new Error(`join: ${response.status} ${response.text}`);
  return { ...response.json, personKey, name };
}

/** Opens a table and seats the host (as admin) and the given guests. */
export async function tableWith(guests: string[], settings?: Record<string, unknown>) {
  const table = await openTable(settings);
  const admin = await join(table, "Admin", { adminSecret: table.adminSecret });
  const others: Seat[] = [];
  for (const name of guests) others.push(await join(table, name));
  return { table, admin, others };
}

export function snapshot(table: { gameId: string }, seat: Seat) {
  return call(`/api/games/${table.gameId}`, { headers: { "x-player-id": seat.id, "x-player-secret": seat.secret } });
}

/** A phone's socket at the table. Resolves once the first state arrives. */
export type Phone = { socket: Socket; state: any; next: (event?: string, match?: (body: any) => boolean) => Promise<any> };

export function rawSocket(auth: Record<string, string>) {
  const socket = connect(`${API}/table`, { transports: ["websocket"], auth, reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
}

export async function phone(table: { gameId: string }, seat: Seat): Promise<Phone> {
  const socket = rawSocket({ gameId: table.gameId, playerId: seat.id, playerSecret: seat.secret });
  const result: Phone = {
    socket,
    state: null,
    next: (event = "state", match = () => true) => waitFor(socket, event, match),
  };
  socket.on("state", (state) => {
    result.state = state;
  });
  result.state = await waitFor(socket, "state");
  return result;
}

export function waitFor(socket: Socket, event: string, match: (body: any) => boolean = () => true, ms = 4000) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`no "${event}" within ${ms} ms`));
    }, ms);
    function listener(body: any) {
      if (!match(body)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(body);
    }
    socket.on(event, listener);
  });
}

/** Resolves when nothing matching arrives for a while. */
export async function nothing(socket: Socket, event: string, match: (body: any) => boolean = () => true, ms = 500) {
  try {
    const body = await waitFor(socket, event, match, ms);
    throw new Error(`unexpected "${event}": ${JSON.stringify(body)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("no ")) return;
    throw error;
  }
}
