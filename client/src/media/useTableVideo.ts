import { useEffect, useState } from "react";
import type { VideoTrack } from "livekit-client";
import type { Credentials } from "@/game/types";
import { videoSupported } from "@/media/videoSupport";

export function useTableVideo(credentials: Credentials | null) {
  const [tracks, setTracks] = useState<Map<string, VideoTrack>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const [setMic, setSetMic] = useState<(enabled: boolean) => void>(() => () => {});

  const gameId = credentials?.gameId;
  const playerId = credentials?.playerId;
  const playerSecret = credentials?.playerSecret;

  useEffect(() => {
    if (!videoSupported || !credentials) return;
    let stopped = false;
    const handle = { disconnect() {}, setMic(_enabled: boolean) {} };
    void import("@/media/tableVideoSession").then((mod) => {
      if (stopped) return;
      const session = mod.startTableVideo(credentials, setTracks, setMicOn);
      handle.disconnect = session.disconnect;
      handle.setMic = session.setMic;
      setSetMic(() => session.setMic);
    });
    return () => {
      stopped = true;
      handle.disconnect();
      setTracks(new Map());
      setMicOn(false);
    };
  }, [gameId, playerId, playerSecret]);

  return { tracks, micOn, setMic };
}
