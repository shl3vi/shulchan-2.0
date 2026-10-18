import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "shulchan.host";

export type Host = { token: string; email: string };

export async function loadHost(): Promise<Host | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Host) : null;
  } catch {
    return null;
  }
}

export async function saveHost(host: Host | null) {
  try {
    if (!host) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(host));
  } catch {
    // The seat screen still has the host for this run.
  }
}
