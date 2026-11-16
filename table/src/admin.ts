/** How long the admin can be disconnected before someone at the table takes over. */
export const ADMIN_AWAY_MS = 2 * 60 * 1000;

type AdminTable = {
  adminId?: string;
  /** Server time the admin was first seen without a connection. Absent while they are connected. */
  adminAwaySince?: number;
  players: { id: string; pendingRemoval?: boolean }[];
};

/**
 * Hands the admin role to a connected player once the admin has been gone for
 * ADMIN_AWAY_MS, so pausing, dealing and removing players cannot get stuck.
 * A short drop (locking the phone, switching apps) does not cost the admin anything.
 * Returns true when the table changed.
 */
export function settleAdmin(table: AdminTable, connected: Set<string>, now: number, pick = randomPick) {
  const admin = table.adminId;
  if (admin && connected.has(admin)) {
    if (table.adminAwaySince == null) return false;
    delete table.adminAwaySince;
    return true;
  }
  const candidates = table.players.filter((player) => !player.pendingRemoval && player.id !== admin && connected.has(player.id));
  if (!admin) {
    if (candidates.length === 0) return false;
    table.adminId = pick(candidates).id;
    delete table.adminAwaySince;
    return true;
  }
  if (table.adminAwaySince == null) {
    table.adminAwaySince = now;
    return true;
  }
  if (now - table.adminAwaySince < ADMIN_AWAY_MS || candidates.length === 0) return false;
  table.adminId = pick(candidates).id;
  delete table.adminAwaySince;
  return true;
}

function randomPick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]!;
}
