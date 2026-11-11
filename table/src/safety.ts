import { pool } from "./db.js";
import type { SeatPlayer } from "./store.js";

export const SUPPORT_EMAIL = "support@loochka.com";

export async function avoidSeats(personKey: string, players: SeatPlayer[]) {
  const others = players.filter((player) => player.personKey && player.personKey !== personKey);
  const keys = others.flatMap((player) => (player.personKey ? [player.personKey] : []));
  if (keys.length === 0) return [];
  const found = await pool.query<{ key: string }>(
    `SELECT blocked AS key FROM blocks WHERE blocker = $1 AND blocked = ANY($2::text[])
     UNION
     SELECT blocker AS key FROM blocks WHERE blocked = $1 AND blocker = ANY($2::text[])`,
    [personKey, keys],
  );
  const hit = new Set(found.rows.map((row) => row.key));
  return others.filter((player) => player.personKey && hit.has(player.personKey)).map((player) => player.seat);
}

export async function blockedSeatIds(viewerKey: string | undefined, players: SeatPlayer[]) {
  const blocked = new Set<string>();
  if (!viewerKey) return blocked;
  const others = players.filter((player) => player.personKey && player.personKey !== viewerKey);
  const keys = others.flatMap((player) => (player.personKey ? [player.personKey] : []));
  if (keys.length === 0) return blocked;
  const found = await pool.query<{ blocked: string }>(
    "SELECT blocked FROM blocks WHERE blocker = $1 AND blocked = ANY($2::text[])",
    [viewerKey, keys],
  );
  const hit = new Set(found.rows.map((row) => row.blocked));
  for (const player of others) {
    if (player.personKey && hit.has(player.personKey)) blocked.add(player.id);
  }
  return blocked;
}

export async function blockPerson(blocker: string, blocked: string) {
  if (blocker === blocked) return;
  await pool.query(
    "INSERT INTO blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [blocker, blocked],
  );
}

export async function unblockPerson(blocker: string, blocked: string) {
  await pool.query("DELETE FROM blocks WHERE blocker = $1 AND blocked = $2", [blocker, blocked]);
}

export async function storeReport(input: {
  tableId: string;
  reporterKey: string;
  reporterName: string;
  reportedKey: string;
  reportedName: string;
  reason: "name" | "camera" | "microphone";
}) {
  await pool.query(
    `INSERT INTO reports (id, table_id, reporter_key, reporter_name, reported_key, reported_name, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      crypto.randomUUID(),
      input.tableId,
      input.reporterKey,
      input.reporterName,
      input.reportedKey,
      input.reportedName,
      input.reason,
    ],
  );
}
