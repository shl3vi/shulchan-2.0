import { useEffect, useState } from "react";
import type { VideoTrack } from "livekit-client";
import type { Credentials } from "@/game/types";
import { videoSupported } from "@/media/videoSupport";

export function useTableVideo(credentials: Credentials | null) {
  const [tracks, setTracks] = useState<Map<string, VideoTrack>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const [toggleMic, setToggleMic] = useState<() => void>(() => () => {});

  useEffect(() => {
    if (!videoSupported || !credentials) return;
    let stopped = false;
    const handle = { disconnect() {}, toggleMic() {} };
    void import("@/media/tableVideoSession").then((mod) => {
      if (stopped) return;
      const session = mod.startTableVideo(credentials, setTracks, setMicOn);
      handle.disconnect = session.disconnect;
      handle.toggleMic = session.toggleMic;
      setToggleMic(() => session.toggleMic);
    });
    return () => {
      stopped = true;
      handle.disconnect();
      setTracks(new Map());
      setMicOn(false);
    };
  }, [credentials]);

  return { tracks, micOn, toggleMic };
}
