import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Credentials } from "@/game/types";

const KEY = "shulchan.seat";

export async function loadSeat(): Promise<Credentials | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export async function saveSeat(credentials: Credentials | null) {
  try {
    if (!credentials) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(credentials));
  } catch {
    // The installed app has not picked up storage yet. The seat stays for this run.
  }
}
