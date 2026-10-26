import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { readSchema, sessionBody } from "./schema.js";
import { redis } from "./store.js";

export const APP_SCHEME = "shulchan";
const CODE_SECONDS = 60;
const SIGN_IN_WINDOW_SECONDS = 10 * 60;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

function signInLimit() {
  const value = Number(process.env.SIGN_IN_LIMIT ?? 10);
  return Number.isInteger(value) && value > 0 ? value : 10;
}

/** Each start keeps a key until Google sends the user back, so this caps how many one address can create. */
async function allowSignIn(ip: string) {
  const key = `signin:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, SIGN_IN_WINDOW_SECONDS);
  return count <= signInLimit();
}

type Pending = { back: string; challenge: string };

/** Any app can claim the link scheme and catch the code, so only the app holding the verifier can redeem it. */
function verifies(verifier: string, challenge: string) {
  const given = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function hostTokenSeconds() {
  const days = Number(process.env.HOST_TOKEN_DAYS ?? 7);
  return Math.max(1, Number.isFinite(days) ? days : 7) * 24 * 60 * 60;
}

function returnUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== "auth" || path !== "") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return `${APP_SCHEME}://auth`;
  } catch {
    return "";
  }
}

function readPending(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Partial<Pending>;
    const back = returnUrl(pending.back ?? "");
    if (!back || !CHALLENGE.test(pending.challenge ?? "")) return null;
    return { back, challenge: pending.challenge! };
  } catch {
    return null;
  }
}

function clientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
}

function clientSecret() {
  return process.env.GOOGLE_OAUTH_SECRET ?? "";
}

function redirectUri() {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "";
}

export const authRouter = Router();

authRouter.get("/auth/google", async (req, res) => {
  if (!clientId() || !clientSecret() || !redirectUri()) {
    res.status(503).type("text").send("Google sign-in is not configured");
    return;
  }
  const back = returnUrl(String(req.query.return ?? `${APP_SCHEME}://auth`));
  if (!back) {
    res.status(400).type("text").send("Bad return");
    return;
  }
  const challenge = String(req.query.challenge ?? "");
  if (!CHALLENGE.test(challenge)) {
    res.status(400).type("text").send("Update the app to sign in");
    return;
  }
  if (!(await allowSignIn(req.ip ?? "unknown"))) {
    res.status(429).type("text").send("Too many sign-in attempts. Try again in a few minutes.");
    return;
  }
  const state = randomBytes(16).toString("hex");
  const pending: Pending = { back, challenge };
  await redis.set(`oauth:${state}`, JSON.stringify(pending), { EX: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

authRouter.get("/auth/callback", async (req, res) => {
  const googleCode = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const pending = readPending(await redis.getDel(`oauth:${state}`));
  if (!googleCode || !pending) {
    res.status(400).type("text").send("Sign-in expired. Try again.");
    return;
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: googleCode,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenResponse.ok || !token.id_token) {
    res.status(401).type("text").send("Google did not confirm this sign-in");
    return;
  }
  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`);
  const info = (await infoResponse.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string };
  if (!infoResponse.ok || info.aud !== clientId() || info.email_verified !== "true" || !info.sub || !info.email) {
    res.status(401).type("text").send("Google did not confirm this sign-in");
    return;
  }
  const code = randomBytes(32).toString("hex");
  await redis.set(
    `oauth-code:${code}`,
    JSON.stringify({ sub: info.sub, email: info.email, challenge: pending.challenge }),
    { EX: CODE_SECONDS },
  );
  const done = new URL(pending.back);
  done.searchParams.set("code", code);
  res.redirect(done.toString());
});

authRouter.post("/auth/session", async (req, res) => {
  const body = readSchema(sessionBody, req.body);
  if (!body) {
    res.status(400).json({ error: "Sign-in expired. Try again." });
    return;
  }
  const code = body.code;
  const raw = await redis.getDel(`oauth-code:${code}`);
  if (!raw) {
    res.status(401).json({ error: "Sign-in expired. Try again." });
    return;
  }
  const session = JSON.parse(raw) as { sub?: string; email?: string; challenge?: string };
  if (!session.sub || !session.email || !session.challenge || !verifies(body.verifier, session.challenge)) {
    res.status(401).json({ error: "Sign-in expired. Try again." });
    return;
  }
  const hostToken = randomBytes(32).toString("hex");
  await redis.set(`host:${hostToken}`, JSON.stringify({ sub: session.sub, email: session.email }), { EX: hostTokenSeconds() });
  res.json({ token: hostToken, email: session.email });
});

export async function readHost(authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const raw = await redis.get(`host:${token}`);
  if (raw) return JSON.parse(raw) as { sub: string; email: string };
  // Local dev cannot reach Railway's private Redis. A token that production accepts is remembered here.
  const upstream = process.env.AUTH_UPSTREAM;
  if (!upstream) return null;
  const response = await fetch(`${upstream}/api/games`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  if (response.status !== 400) return null;
  const host = { sub: "upstream", email: "signed-in" };
  await redis.set(`host:${token}`, JSON.stringify(host), { EX: hostTokenSeconds() });
  return host;
}
