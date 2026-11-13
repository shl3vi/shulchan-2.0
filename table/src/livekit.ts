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

/** Epoch 0 keeps the original room name so a running table is not split across two rooms. */
export function mediaRoom(tableId: string, epoch: number | undefined) {
  const n = epoch ?? 0;
  return n > 0 ? `${tableId}:${n}` : tableId;
}

/**
 * Rooms that must not stay up. A pause deletes only the previous epoch, so an
 * in-flight delete cannot drop the room people join after they resume.
 * Closing the table also deletes the room they are in now.
 */
export function mediaRooms(tableId: string, epoch: number | undefined, includeCurrent: boolean) {
  const rooms = new Set<string>();
  const current = epoch ?? 0;
  if (includeCurrent) {
    rooms.add(mediaRoom(tableId, current));
    rooms.add(tableId);
  }
  if (current > 0) rooms.add(mediaRoom(tableId, current - 1));
  return [...rooms];
}

function roomClient() {
  const config = liveKitConfig();
  if (!config) return null;
  return new RoomServiceClient(config.url.replace(/^wss:/, "https:"), config.key, config.secret);
}

/** A token only gates joining, so a removed player stays on camera until the room drops them. */
export async function removeFromRoom(room: string, identity: string) {
  const rooms = roomClient();
  if (!rooms) return;
  try {
    await rooms.removeParticipant(room, identity);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
}

/** Drops the room itself. A saved token can recreate it, so a pause keeps deleting the old one. */
export async function endRoom(room: string) {
  const rooms = roomClient();
  if (!rooms) return;
  try {
    await rooms.deleteRoom(room);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
}

export async function stopMedia(tableId: string, epoch: number | undefined, includeCurrent: boolean) {
  for (const room of mediaRooms(tableId, epoch, includeCurrent)) {
    try {
      await endRoom(room);
    } catch (error) {
      console.error("Could not stop table media", room, error instanceof Error ? error.message : error);
    }
  }
}
