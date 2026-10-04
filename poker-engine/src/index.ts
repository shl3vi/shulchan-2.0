import express from "express";
import { createClient, type RedisClientType } from "redis";
import { act, createDoc, present, seatPlayer, startHand, unseat, type ActionName, type EngineDoc } from "./game.js";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const redis: RedisClientType = createClient({ url: redisUrl });
await redis.connect();

const actions = new Set<ActionName>(["fold", "check", "call", "bet", "raise"]);
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function key(id: string) {
  return `poker:${id}`;
}

async function read(id: string): Promise<EngineDoc | null> {
  const raw = await redis.get(key(id));
  return raw ? (JSON.parse(raw) as EngineDoc) : null;
}

async function write(id: string, doc: EngineDoc) {
  await redis.set(key(id), JSON.stringify(doc));
}

async function locked<T>(id: string, run: () => Promise<T>): Promise<T> {
  const lock = `lock:poker:${id}`;
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const acquired = await redis.set(lock, token, { NX: true, PX: 5000 });
    if (acquired) {
      try {
        return await run();
      } finally {
        if ((await redis.get(lock)) === token) await redis.del(lock);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Table is busy");
}

app.post("/tables", async (req, res) => {
  const id = String(req.body?.tableId ?? "");
  const smallBlind = Number(req.body?.smallBlind);
  if (!id) {
    res.status(400).json({ error: "tableId is required" });
    return;
  }
  if (!Number.isInteger(smallBlind) || smallBlind < 1) {
    res.status(400).json({ error: "smallBlind must be a positive integer" });
    return;
  }
  await write(id, createDoc(smallBlind));
  res.status(201).json(present((await read(id))!));
});

app.get("/tables/:id", async (req, res) => {
  const doc = await read(String(req.params.id));
  if (!doc) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(present(doc));
});

app.post("/tables/:id/seat", async (req, res) => {
  const id = String(req.params.id);
  const seat = Number(req.body?.seat);
  const stack = Number(req.body?.stack);
  try {
    const view = await locked(id, async () => {
      const doc = await read(id);
      if (!doc) throw new Error("Game not found");
      if (!Number.isInteger(seat) || !Number.isInteger(stack) || stack < 1) throw new Error("Invalid seat");
      const next = seatPlayer(doc, seat, stack);
      await write(id, next);
      return present(next);
    });
    res.status(201).json(view);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Seat failed" });
  }
});

app.post("/tables/:id/unseat", async (req, res) => {
  const id = String(req.params.id);
  const seat = Number(req.body?.seat);
  try {
    const view = await locked(id, async () => {
      const doc = await read(id);
      if (!doc) throw new Error("Game not found");
      const next = unseat(doc, seat);
      await write(id, next);
      return present(next);
    });
    res.json(view);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Cannot leave" });
  }
});

app.post("/tables/:id/start", async (req, res) => {
  const id = String(req.params.id);
  try {
    const view = await locked(id, async () => {
      const doc = await read(id);
      if (!doc) throw new Error("Game not found");
      const next = startHand(doc);
      await write(id, next);
      return present(next);
    });
    res.json(view);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Cannot start" });
  }
});

app.post("/tables/:id/act", async (req, res) => {
  const id = String(req.params.id);
  const action = req.body?.action as ActionName;
  const seat = Number(req.body?.seat);
  const amount = req.body?.amount == null ? undefined : Number(req.body.amount);
  if (!actions.has(action)) {
    res.status(400).json({ error: "Unknown action" });
    return;
  }
  try {
    const view = await locked(id, async () => {
      const doc = await read(id);
      if (!doc) throw new Error("Game not found");
      const next = act(doc, seat, action, amount);
      await write(id, next);
      return present(next);
    });
    res.json(view);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Action failed" });
  }
});

const port = Number(process.env.PORT ?? 4001);
app.listen(port, "0.0.0.0", () => {
  console.log(`Poker engine listening on http://localhost:${port}`);
});
