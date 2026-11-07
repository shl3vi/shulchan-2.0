import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "shulchan.person";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memory: string | null = null;

function uuid() {
  const bytes = Crypto.getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readRaw() {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

export async function loadPersonKey() {
  if (memory) return memory;
  try {
    const saved = await readRaw();
    if (saved && UUID.test(saved)) {
      memory = saved;
      return saved;
    }
  } catch {
    // A new key still identifies this run, and the next successful save keeps it.
  }
  memory = uuid();
  try {
    if (Platform.OS === "web") await AsyncStorage.setItem(KEY, memory);
    else await SecureStore.setItemAsync(KEY, memory);
  } catch {
    // The key stays for this run.
  }
  return memory;
}
