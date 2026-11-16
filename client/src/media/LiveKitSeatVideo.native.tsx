import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { VideoView } from "@livekit/react-native";
import { MediaStream, RTCView, type MediaStreamTrack } from "@livekit/react-native-webrtc";
import { RemoteVideoTrack, type VideoTrack } from "livekit-client";

export function LiveKitSeatVideo({ track }: { track: VideoTrack }) {
  if (track instanceof RemoteVideoTrack) return <RemoteSeatVideo key={track.mediaStreamTrack.id} track={track} />;
  return <VideoView style={styles.camera} videoTrack={track} objectFit="cover" />;
}

/**
 * A remote camera comes back on a new WebRTC track but in the same remote stream
 * (same stream id, same view URL), and the native view can resolve that URL to the
 * ended track and stay black. A stream of its own holds only this track, and the
 * key gives each new track its own view.
 */
function RemoteSeatVideo({ track }: { track: RemoteVideoTrack }) {
  const [stream] = useState(() => new MediaStream([track.mediaStreamTrack as unknown as MediaStreamTrack]));

  useEffect(() => () => stream.release(false), [stream]);

  return <RTCView style={styles.camera} streamURL={stream.toURL()} objectFit="cover" />;
}

const styles = StyleSheet.create({
  camera: { width: "100%", height: "100%" },
});
