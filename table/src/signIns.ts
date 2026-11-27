import { createHash } from "node:crypto";
import { pool } from "./db.js";
import { redis } from "./store.js";

/**
 * Host sign-ins and Apple accounts live in Postgres, so a Redis restart that loses its data
 * signs nobody out. Each sign-in lasts HOST_TOKEN_DAYS (30 by default) from when it was last used.
 */

export type Host = { sub: string; email: string; name?: string };

export function hostTokenDays() {
  const days = Number(process.env.HOST_TOKEN_DAYS ?? 30);
  return Math.max(1, Number.isFinite(days) ? days : 30);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hostOf(row: { sub: string; email: string; name: string | null }): Host {
  return { sub: row.sub, email: row.email, ...(row.name ? { name: row.name } : {}) };
}

export async function saveHostSession(token: string, host: Host) {
  await pool.query(
    `INSERT INTO host_sessions (token_hash, sub, email, name, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int))
     ON CONFLICT (token_hash) DO UPDATE
       SET sub = EXCLUDED.sub, email = EXCLUDED.email, name = EXCLUDED.name, expires_at = EXCLUDED.expires_at`,
    [hashToken(token), host.sub, host.email, host.name ?? null, hostTokenDays()],
  );
}

/** The host for this token, or null. Using a sign-in starts its 30 days again. */
export async function readHostSession(token: string): Promise<Host | null> {
  const found = await pool.query<{ sub: string; email: string; name: string | null }>(
    `UPDATE host_sessions SET expires_at = now() + make_interval(days => $2::int)
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING sub, email, name`,
    [hashToken(token), hostTokenDays()],
  );
  const row = found.rows[0];
  return row ? hostOf(row) : null;
}

/** Signs out every device of this email, and this one token whatever it carries. */
export async function deleteHostSessions(email: string, token: string) {
  await pool.query("DELETE FROM host_sessions WHERE email = $1 OR token_hash = $2", [email, hashToken(token)]);
}

export async function purgeExpiredSessions() {
  await pool.query("DELETE FROM host_sessions WHERE expires_at < now()");
}

export type AppleAccount = { email: string; name?: string; refreshToken?: string };

export async function readAppleAccount(sub: string): Promise<AppleAccount | null> {
  const found = await pool.query<{ email: string; name: string | null; refresh_token: string | null }>(
    "SELECT email, name, refresh_token FROM apple_accounts WHERE sub = $1",
    [sub],
  );
  const row = found.rows[0];
  if (!row) return null;
  return { email: row.email, ...(row.name ? { name: row.name } : {}), ...(row.refresh_token ? { refreshToken: row.refresh_token } : {}) };
}

export async function saveAppleAccount(sub: string, account: AppleAccount) {
  await pool.query(
    `INSERT INTO apple_accounts (sub, email, name, refresh_token) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, refresh_token = EXCLUDED.refresh_token, updated_at = now()`,
    [sub, account.email, account.name ?? null, account.refreshToken ?? null],
  );
}

export async function deleteAppleAccountRecord(sub: string) {
  await pool.query("DELETE FROM apple_accounts WHERE sub = $1", [sub]);
}

/**
 * Sign-ins used to live in Redis as `host:<token>` and `apple:<sub>`. Copies any left there into Postgres
 * and removes them, so hosts signed in before this change, store reviewers included, stay signed in.
 * Safe to run on every start; it does nothing once Redis has none left. Remove after launch.
 */
export async function copyRedisSignIns() {
  for await (const key of redis.scanIterator({ MATCH: "host:*", COUNT: 100 })) {
    const name = String(key);
    const raw = await redis.get(name);
    try {
      const host = raw ? JSON.parse(raw) as Partial<Host> : null;
      if (host?.sub && host.email) {
        await pool.query(
          `INSERT INTO host_sessions (token_hash, sub, email, name, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int)) ON CONFLICT (token_hash) DO NOTHING`,
          [hashToken(name.slice("host:".length)), host.sub, host.email, host.name ?? null, hostTokenDays()],
        );
      }
    } catch {
      // Not a sign-in. Dropped below like the rest.
    }
    await redis.del(name);
  }
  for await (const key of redis.scanIterator({ MATCH: "apple:*", COUNT: 100 })) {
    const name = String(key);
    const raw = await redis.get(name);
    try {
      const account = raw ? JSON.parse(raw) as Partial<AppleAccount> : null;
      if (account?.email) {
        await pool.query(
          `INSERT INTO apple_accounts (sub, email, name, refresh_token) VALUES ($1, $2, $3, $4) ON CONFLICT (sub) DO NOTHING`,
          [name.slice("apple:".length), account.email, account.name ?? null, account.refreshToken ?? null],
        );
      }
    } catch {
      // Not an Apple account record.
    }
    await redis.del(name);
  }
}
