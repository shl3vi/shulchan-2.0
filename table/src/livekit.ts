import { AccessToken } from "livekit-server-sdk";

export async function liveKitToken(room: string, identity: string, name: string) {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY ?? "devkey",
    process.env.LIVEKIT_API_SECRET ?? "secret",
    { identity, name },
  );
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return {
    token: await token.toJwt(),
    url: process.env.LIVEKIT_URL ?? "ws://127.0.0.1:7880",
  };
}
