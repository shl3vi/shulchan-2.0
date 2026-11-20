import { useEffect, useRef } from "react";
import { Track, type VideoTrack } from "livekit-client";

/**
 * The browser draws a seat camera in a plain <video>. livekit-client attaches the track to it
 * and detaches it when the tile goes away. Your own camera is mirrored, like a mirror would show it.
 */
export function LiveKitSeatVideo({ track }: { track: VideoTrack }) {
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = element.current;
    if (!video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track]);

  const own = track.isLocal && track.source === Track.Source.Camera;
  return (
    <video
      ref={element}
      autoPlay
      playsInline
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transform: own ? "scaleX(-1)" : undefined }}
    />
  );
}
