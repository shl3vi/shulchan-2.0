import { StyleSheet } from "react-native";
import { VideoView } from "@livekit/react-native";
import type { VideoTrack } from "livekit-client";

export function LiveKitSeatVideo({ track }: { track: VideoTrack }) {
  return <VideoView style={styles.camera} videoTrack={track} objectFit="cover" />;
}

const styles = StyleSheet.create({
  camera: { width: "100%", height: "100%" },
});
