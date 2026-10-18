import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Credentials } from "@/game/types";

const KEY = "shulchan.seat";

function seatOf(value: unknown): Credentials | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Credentials>;
  if (!record.gameId || !record.playerId || !record.playerSecret) return null;
  return { gameId: record.gameId, playerId: record.playerId, playerSecret: record.playerSecret };
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  const secure = await SecureStore.getItemAsync(KEY);
  if (secure) return secure;
  const legacy = await AsyncStorage.getItem(KEY);
  if (!legacy) return null;
  const seat = seatOf(JSON.parse(legacy));
  await AsyncStorage.removeItem(KEY);
  if (!seat) return null;
  const next = JSON.stringify(seat);
  await SecureStore.setItemAsync(KEY, next);
  return next;
}

export async function loadSeat(): Promise<Credentials | null> {
  try {
    const raw = await readRaw();
    return raw ? seatOf(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveSeat(credentials: Credentials | null) {
  try {
    const seat = credentials ? seatOf(credentials) : null;
    const raw = seat ? JSON.stringify(seat) : null;
    if (Platform.OS === "web") {
      if (!raw) await AsyncStorage.removeItem(KEY);
      else await AsyncStorage.setItem(KEY, raw);
      return;
    }
    if (!raw) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, raw);
    await AsyncStorage.removeItem(KEY);
  } catch {
    // The installed app has not picked up storage yet. The seat stays for this run.
  }
}
