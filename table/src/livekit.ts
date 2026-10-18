import { AccessToken } from "livekit-server-sdk";

const TOKEN_TTL = "5m";

export class VideoUnavailable extends Error {
  constructor() {
    super("Video is not available");
  }
}

export async function liveKitToken(room: string, identity: string, name: string) {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!key || !secret || !url?.startsWith("wss://")) throw new VideoUnavailable();
  const token = new AccessToken(key, secret, { identity, name, ttl: TOKEN_TTL });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return {
    token: await token.toJwt(),
    url,
  };
}
