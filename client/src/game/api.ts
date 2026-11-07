import * as Crypto from "expo-crypto";
import { loadPersonKey } from "@/game/personKey";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://shulchan.win";

async function post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

const pendingCodes = new Map<string, Promise<{ token: string; email: string; name?: string }>>();
let signInVerifier: string | null = null;

/** Another app can catch the redirect, so the code only redeems together with this verifier, which never leaves the phone until then. */
export async function signInUrl(back: string) {
  const bytes = Crypto.getRandomBytes(32);
  const verifier = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  signInVerifier = verifier;
  return `${API_URL}/auth/google?${new URLSearchParams({ return: back, challenge })}`;
}

/** The redirect carries a one-time code. Two screens can redeem the same code; only one request is sent. */
export function signInWithApple(identityToken: string, name?: string) {
  return post<{ token: string; email: string; name?: string }>("/auth/apple", {
    identityToken,
    ...(name ? { name } : {}),
  });
}

export function redeemHostCode(code: string) {
  const existing = pendingCodes.get(code);
  if (existing) return existing;
  const verifier = signInVerifier;
  if (!verifier) return Promise.reject(new Error("Sign-in expired. Try again."));
  const pending = post<{ token: string; email: string; name?: string }>("/auth/session", { code, verifier }).finally(() => {
    pendingCodes.delete(code);
  });
  pendingCodes.set(code, pending);
  return pending;
}

/** False when the saved host token is gone. Null when the server cannot be asked, so the phone keeps the sign-in. */
export async function hostSession(token: string): Promise<{ name?: string } | false | null> {
  try {
    const response = await fetch(`${API_URL}/auth/host`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return false;
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { name?: string } | null;
      const name = body?.name?.trim();
      return name ? { name } : {};
    }
    if (response.status !== 404) return null;
    const probe = await fetch(`${API_URL}/api/games`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    });
    if (probe.status === 401) return false;
    if (probe.status === 400) return {};
    return null;
  } catch {
    return null;
  }
}

export async function deleteHostAccount(token: string) {
  const response = await fetch(`${API_URL}/auth/account`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return;
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed");
  }
}

export function createTable(
  smallBlind: number,
  buyIn: number,
  hostToken: string,
  kind: "poker" | "backgammon" = "poker",
  autoDeal = false,
) {
  return post<{ gameId: string; adminSecret: string; password: string }>("/api/games", {
    smallBlind,
    buyIn,
    kind,
    ...(kind === "poker" ? { autoDeal } : {}),
  }, {
    authorization: `Bearer ${hostToken}`,
  });
}

export async function joinTable(gameId: string, name: string, password: string, adminSecret?: string) {
  const personKey = await loadPersonKey();
  return post<{ id: string; secret: string }>(`/api/games/${gameId}/join`, { name, password, adminSecret, personKey });
}

export function reportPlayer(
  gameId: string,
  playerId: string,
  secret: string,
  targetId: string,
  reason: "name" | "camera" | "microphone",
) {
  return post<{ ok: true }>(`/api/games/${gameId}/report`, { playerId, secret, targetId, reason });
}

export function blockPlayer(gameId: string, playerId: string, secret: string, targetId: string, blocked: boolean) {
  return post<{ ok: true }>(`/api/games/${gameId}/${blocked ? "block" : "unblock"}`, { playerId, secret, targetId });
}

/** True when this seat is still at the table. A failed request leaves the seat alone. */
export async function tableExists(gameId: string, playerId: string, secret: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/games/${encodeURIComponent(gameId)}`, {
      headers: { "x-player-id": playerId, "x-player-secret": secret },
    });
    if (response.status === 404 || response.status === 401) return false;
    return true;
  } catch {
    return true;
  }
}

export function liveKitToken(gameId: string, playerId: string, secret: string) {
  return post<{ token: string; url: string }>(`/api/games/${gameId}/livekit`, { playerId, secret });
}
