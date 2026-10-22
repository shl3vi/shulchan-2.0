import { PermissionsAndroid, Platform } from "react-native";

export async function allowCapture(kind: "camera" | "microphone") {
  if (Platform.OS !== "android") return true;
  const permission = kind === "camera" ? PermissionsAndroid.PERMISSIONS.CAMERA : PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
