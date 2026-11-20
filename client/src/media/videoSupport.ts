import { NativeModules, Platform } from "react-native";

function browserHasWebRtc() {
  return typeof RTCPeerConnection !== "undefined" && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia != null;
}

/**
 * True when video can run here: the app binary includes LiveKit's native WebRTC module (Expo Go does not),
 * or the browser has WebRTC and camera access (a page over plain http has no camera access).
 */
export const videoSupported = Platform.OS === "web" ? browserHasWebRtc() : NativeModules.WebRTCModule != null;
