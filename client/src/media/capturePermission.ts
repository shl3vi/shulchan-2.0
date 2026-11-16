import { PermissionsAndroid, Platform } from "react-native";

export async function allowCapture(kind: "camera" | "microphone") {
  if (Platform.OS !== "android") return true;
  const permission = kind === "camera" ? PermissionsAndroid.PERMISSIONS.CAMERA : PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: kind === "camera" ? "Camera" : "Microphone",
    message: kind === "camera"
      ? "People at your table see your camera live. LOOCHKA does not record or store it."
      : "People at your table hear you live. LOOCHKA does not record or store it.",
    buttonPositive: "Allow",
    buttonNegative: "Don't allow",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
