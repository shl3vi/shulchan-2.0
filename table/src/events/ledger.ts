import { publish } from "./bus.js";
import { redis } from "../store.js";
import type { GameKind } from "../games/index.js";
import { applyPlayers, freshTally, type Tally } from "./tally.js";

function key(id: string) {
  return `ledger:${id}`;
}

async function load(id: string): Promise<Tally | null> {
  try {
    const raw = await redis.get(key(id));
    if (!raw) return null;
    return JSON.parse(raw) as Tally;
  } catch (error) {
    console.error("Ledger read failed", error instanceof Error ? error.message : error);
    return null;
  }
}

async function save(id: string, tally: Tally) {
  try {
    await redis.set(key(id), JSON.stringify(tally));
  } catch (error) {
    console.error("Ledger write failed", error instanceof Error ? error.message : error);
  }
}

function summary(id: string, tally: Tally, endReason: "closed" | "expired" | "idle") {
  publish({
    name: "session.summary",
    tableId: id,
    kind: tally.kind,
    data: {
      durationMs: Math.max(0, Date.now() - tally.createdAt),
      peakPlayers: tally.peakPlayers,
      games: tally.games,
      rounds: tally.rounds,
      joinRefusals: tally.joinRefusals,
      errors: tally.errors,
      videoUsed: tally.videoUsed,
      appJoins: tally.appJoins ?? 0,
      webJoins: tally.webJoins ?? 0,
      endReason,
    },
  });
}

async function finish(id: string, tally: Tally, endReason: "closed" | "expired" | "idle") {
  summary(id, tally, endReason);
  try {
    await redis.del(key(id));
  } catch (error) {
    console.error("Ledger delete failed", error instanceof Error ? error.message : error);
  }
}

export async function openTable(id: string, kind: GameKind) {
  if (await load(id)) return;
  await save(id, freshTally(kind, Date.now()));
}

export async function notePlayers(id: string, count: number) {
  const tally = await load(id);
  if (!tally) return;
  const closed = applyPlayers(tally, count);
  if (closed) {
    await finish(id, tally, "closed");
    return;
  }
  await save(id, tally);
}

/** Lets a game add its own counts to a table's stats. Tables of another kind are left alone. */
export async function changeTally(id: string, kind: GameKind, apply: (tally: Tally) => void) {
  const tally = await load(id);
  if (!tally || tally.kind !== kind) return;
  apply(tally);
  await save(id, tally);
}

/** One seat taken, from the app or from a browser. Counted in the summary, not sent on its own. */
export async function noteJoin(id: string, web: boolean) {
  const tally = await load(id);
  if (!tally) return;
  if (web) tally.webJoins = (tally.webJoins ?? 0) + 1;
  else tally.appJoins = (tally.appJoins ?? 0) + 1;
  await save(id, tally);
}

export async function noteJoinRefused(id: string) {
  const tally = await load(id);
  if (!tally) return;
  tally.joinRefusals += 1;
  await save(id, tally);
}

export async function noteError(id: string) {
  const tally = await load(id);
  if (!tally) return;
  tally.errors += 1;
  await save(id, tally);
}

export async function noteVideo(id: string) {
  const tally = await load(id);
  if (!tally) return;
  tally.videoUsed = true;
  await save(id, tally);
}

export async function summarizeExpired(ids: string[]) {
  for (const id of ids) {
    const tally = await load(id);
    if (tally) await finish(id, tally, "expired");
  }
}

export async function summarizeIdle(id: string) {
  const tally = await load(id);
  if (tally) await finish(id, tally, "idle");
}

export async function dropLedger(id: string) {
  try {
    await redis.del(key(id));
  } catch (error) {
    console.error("Ledger delete failed", error instanceof Error ? error.message : error);
  }
}
