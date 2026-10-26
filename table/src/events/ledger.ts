import { publish } from "./bus.js";
import { redis } from "../store.js";
import { applyBackgammon, applyPlayers, applyPoker, freshTally, type PokerRound, type TableKind, type Tally } from "./tally.js";

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

function summary(id: string, tally: Tally, endReason: "closed" | "expired") {
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
      endReason,
    },
  });
}

async function finish(id: string, tally: Tally, endReason: "closed" | "expired") {
  summary(id, tally, endReason);
  try {
    await redis.del(key(id));
  } catch (error) {
    console.error("Ledger delete failed", error instanceof Error ? error.message : error);
  }
}

export async function openTable(id: string, kind: TableKind) {
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

export async function notePoker(id: string, round: PokerRound) {
  const tally = await load(id);
  if (!tally || tally.kind === "backgammon") return;
  applyPoker(tally, round);
  await save(id, tally);
}

export async function noteBackgammon(
  id: string,
  previous: { phase?: unknown; turn?: unknown } | null,
  next: { phase?: unknown; turn?: unknown },
  gamesGained: number,
) {
  const tally = await load(id);
  if (!tally || tally.kind !== "backgammon") return;
  applyBackgammon(tally, previous, next, gamesGained);
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

export async function dropLedger(id: string) {
  try {
    await redis.del(key(id));
  } catch (error) {
    console.error("Ledger delete failed", error instanceof Error ? error.message : error);
  }
}
