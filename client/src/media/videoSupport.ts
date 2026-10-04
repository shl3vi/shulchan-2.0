import { NativeModules } from "react-native";

/** True when this binary includes LiveKit's native WebRTC module. Expo Go does not. */
export const videoSupported = NativeModules.WebRTCModule != null;
