import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "shulchan.host";

export type Host = { token: string; email: string };

async function readRaw(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  const secure = await SecureStore.getItemAsync(KEY);
  if (secure) return secure;
  const legacy = await AsyncStorage.getItem(KEY);
  if (!legacy) return null;
  await SecureStore.setItemAsync(KEY, legacy);
  await AsyncStorage.removeItem(KEY);
  return legacy;
}

export async function loadHost(): Promise<Host | null> {
  try {
    const raw = await readRaw();
    return raw ? (JSON.parse(raw) as Host) : null;
  } catch {
    return null;
  }
}

export async function saveHost(host: Host | null) {
  try {
    if (Platform.OS === "web") {
      if (!host) await AsyncStorage.removeItem(KEY);
      else await AsyncStorage.setItem(KEY, JSON.stringify(host));
      return;
    }
    if (!host) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, JSON.stringify(host));
    await AsyncStorage.removeItem(KEY);
  } catch {
    // The home screen still has the host for this run.
  }
}
