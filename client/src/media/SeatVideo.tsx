import { useEffect, useState, type ComponentType } from "react";
import { View } from "react-native";
import type { VideoTrack } from "livekit-client";
import { SeatShutter } from "@/media/SeatShutter";
import { videoSupported } from "@/media/videoSupport";

type Listenable = { isMuted: boolean; on: (event: string, listener: () => void) => unknown; off: (event: string, listener: () => void) => unknown };

/** A camera that is switched off keeps its track, with the last frame still on it, so follow the track's muted state. */
function useCameraOff(track: VideoTrack) {
  const [off, setOff] = useState(track.isMuted);
  useEffect(() => {
    const source = track as unknown as Listenable;
    const update = () => setOff(source.isMuted);
    update();
    source.on("muted", update);
    source.on("unmuted", update);
    return () => {
      source.off("muted", update);
      source.off("unmuted", update);
    };
  }, [track]);
  return off;
}

/**
 * `shutter` draws the closing and opening iris when the camera goes off and on. `closing` is for a camera
 * that was just switched off: its track is already gone, and the screen keeps it for a moment so the iris can close.
 * A table that has its own curtain turns it off.
 */
export function SeatVideo({ track, shutter = true, closing = false }: { track: VideoTrack; shutter?: boolean; closing?: boolean }) {
  const [View_, setView] = useState<ComponentType<{ track: VideoTrack }> | null>(null);
  const off = useCameraOff(track);

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

  if (!View_) return null;
  if (!shutter) return <View_ track={track} />;
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View_ track={track} />
      <SeatShutter closed={off || closing} />
    </View>
  );
}
