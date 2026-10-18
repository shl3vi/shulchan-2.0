import { randomBytes } from "node:crypto";
import { Router } from "express";
import { redis } from "./store.js";

const redirectUri = "https://shulchan.win/auth/callback";

function returnUrl(value: string) {
  return value.startsWith("client://") || value.startsWith("exp://") ? value : "";
}

function clientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
}

function clientSecret() {
  return process.env.GOOGLE_OAUTH_SECRET ?? "";
}

export const authRouter = Router();

authRouter.get("/auth/google", async (req, res) => {
  if (!clientId() || !clientSecret()) {
    res.status(503).type("text").send("Google sign-in is not configured");
    return;
  }
  const back = returnUrl(String(req.query.return ?? "client://auth"));
  if (!back) {
    res.status(400).type("text").send("Bad return");
    return;
  }
  const state = randomBytes(16).toString("hex");
  await redis.set(`oauth:${state}`, back, { EX: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

authRouter.get("/auth/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const back = returnUrl((await redis.getDel(`oauth:${state}`)) ?? "");
  if (!code || !back) {
    res.status(400).type("text").send("Sign-in expired. Try again.");
    return;
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
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
  const hostToken = randomBytes(32).toString("hex");
  await redis.set(`host:${hostToken}`, JSON.stringify({ sub: info.sub, email: info.email }), { EX: 60 * 60 * 24 * 30 });
  const done = new URL(back);
  done.searchParams.set("token", hostToken);
  done.searchParams.set("email", info.email);
  res.redirect(done.toString());
});

export async function readHost(authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const raw = await redis.get(`host:${token}`);
  return raw ? (JSON.parse(raw) as { sub: string; email: string }) : null;
}
