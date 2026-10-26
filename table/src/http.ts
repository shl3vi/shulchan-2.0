import type { NextFunction, Request, Response } from "express";
import { redis } from "./store.js";

export function allowedOrigins() {
  return (process.env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-player-id, x-player-secret, x-table-password");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/health") {
    next();
    return;
  }
  const value = Number(process.env.RATE_LIMIT ?? 60);
  const limit = Number.isInteger(value) && value > 0 ? value : 60;
  const ip = req.ip ?? "unknown";
  const key = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  void redis.incr(key).then(async (count) => {
    if (count === 1) await redis.expire(key, 60);
    if (count > limit) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  }).catch(next);
}

export async function allowSocketEvent(playerId: string) {
  const value = Number(process.env.SOCKET_EVENT_LIMIT ?? 60);
  const limit = Number.isInteger(value) && value > 0 ? value : 60;
  const key = `sock:${playerId}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= limit;
}
