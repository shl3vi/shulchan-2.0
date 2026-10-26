import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const TOKEN_TTL = "5m";

export class VideoUnavailable extends Error {
  constructor() {
    super("Video is not available");
  }
}

function liveKitConfig() {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!key || !secret || !url?.startsWith("wss://")) return null;
  return { key, secret, url };
}

export async function liveKitToken(room: string, identity: string, name: string) {
  const config = liveKitConfig();
  if (!config) throw new VideoUnavailable();
  const token = new AccessToken(config.key, config.secret, { identity, name, ttl: TOKEN_TTL });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return {
    token: await token.toJwt(),
    url: config.url,
  };
}

/** A token only gates joining, so a removed player stays on camera until the room drops them. */
export async function removeFromRoom(room: string, identity: string) {
  const config = liveKitConfig();
  if (!config) return;
  const rooms = new RoomServiceClient(config.url.replace(/^wss:/, "https:"), config.key, config.secret);
  try {
    await rooms.removeParticipant(room, identity);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
}
