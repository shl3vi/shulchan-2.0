import { useEffect, useState, type ComponentType } from "react";
import type { VideoTrack } from "livekit-client";
import { videoSupported } from "@/media/videoSupport";

export function SeatVideo({ track }: { track: VideoTrack }) {
  const [View, setView] = useState<ComponentType<{ track: VideoTrack }> | null>(null);

  useEffect(() => {
    if (!videoSupported) return;
    let cancelled = false;
    void import("@/media/LiveKitSeatVideo").then((mod) => {
      if (!cancelled) setView(() => mod.LiveKitSeatVideo);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!View) return null;
  return <View track={track} />;
}
