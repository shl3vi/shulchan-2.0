import { timingSafeEqual } from "node:crypto";
import express from "express";
import { applyAction, createDoc, present, type ActionName, type EngineDoc, type PokerAction } from "./game.js";

const engineToken = process.env.ENGINE_TOKEN;
if (!engineToken) throw new Error("ENGINE_TOKEN is required");
const expectedToken = Buffer.from(engineToken);

const actionNames = new Set<ActionName>(["fold", "check", "call", "bet", "raise"]);
const app = express();
app.use(express.json({ limit: "128kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, game: "poker" });
});

app.use((req, res, next) => {
  const given = Buffer.from(req.get("x-engine-token") ?? "");
  if (given.length !== expectedToken.length || !timingSafeEqual(given, expectedToken)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

function whole(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isHand(value: unknown): value is EngineDoc {
  if (!value || typeof value !== "object") return false;
  const hand = value as EngineDoc;
  return Number.isInteger(hand.smallBlind) && hand.smallBlind >= 1 && Array.isArray(hand.seats) && Array.isArray(hand.waiting);
}

function readAction(value: unknown): PokerAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as { type?: string; seat?: number; stack?: number; amount?: number; action?: string };
  if (action.type === "present") return { type: "present" };
  if (action.type === "start") return { type: "start" };
  if (action.type === "seat" && whole(action.seat) && whole(action.stack)) {
    return { type: "seat", seat: action.seat, stack: action.stack };
  }
  if (action.type === "add" && whole(action.seat) && whole(action.amount)) {
    return { type: "add", seat: action.seat, amount: action.amount };
  }
  if (action.type === "unseat" && whole(action.seat)) return { type: "unseat", seat: action.seat };
  if (action.type === "act" && whole(action.seat) && actionNames.has(action.action as ActionName)) {
    const amount = action.amount == null ? undefined : Number(action.amount);
    return { type: "act", seat: action.seat, action: action.action as ActionName, amount };
  }
  return null;
}

app.post("/games", (req, res) => {
  const smallBlind = Number(req.body?.smallBlind);
  if (!Number.isInteger(smallBlind) || smallBlind < 1) {
    res.status(400).json({ error: "smallBlind must be a positive integer" });
    return;
  }
  const hand = createDoc(smallBlind);
  res.status(201).json({ hand, view: present(hand) });
});

app.post("/apply", (req, res) => {
  const action = readAction(req.body?.action);
  if (!isHand(req.body?.hand) || !action) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const hand = applyAction(req.body.hand, action);
    res.json({ hand, view: present(hand) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Action failed" });
  }
});

const port = Number(process.env.PORT ?? 4001);
const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`Poker engine listening on http://0.0.0.0:${port}`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await Promise.race([
    new Promise((resolve) => httpServer.close(() => resolve(undefined))),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
