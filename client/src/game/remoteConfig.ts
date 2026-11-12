import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "@/game/api";
import { setNameExtras } from "@/game/name";
import { compareVersions } from "@/game/version";

export type RemoteConfig = {
  ads: { enabled: boolean; bannerUnitId: string };
  poker: { autoDealDefault: boolean };
  update: { minVersion: string; force: boolean; iosUrl: string; androidUrl: string };
  announcement: string;
  names: { embedded: string[]; words: string[] };
};

const fallback: RemoteConfig = {
  ads: {
    enabled: process.env.EXPO_PUBLIC_ADS_ENABLED !== "false",
    bannerUnitId: "",
  },
  poker: { autoDealDefault: true },
  update: { minVersion: "", force: false, iosUrl: "", androidUrl: "" },
  announcement: "",
  names: { embedded: [], words: [] },
};

let current = fallback;
const listeners = new Set<() => void>();

export function remoteConfig() {
  return current;
}

export function subscribeRemoteConfig(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function bool(value: unknown, fallbackValue: boolean) {
  return typeof value === "boolean" ? value : fallbackValue;
}

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function httpsUrl(value: unknown) {
  const raw = text(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function terms(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const term = item.trim().slice(0, 40);
    if (term.length < 2) continue;
    out.push(term);
    if (out.length >= 200) break;
  }
  return out;
}

function apply(body: unknown): RemoteConfig {
  const record = object(body);
  if (!record) return current;
  const ads = object(record.ads);
  const poker = object(record.poker);
  const update = object(record.update);
  const names = object(record.names);
  const minVersion = text(update?.minVersion, 20);
  const banner = text(ads?.bannerUnitId, 128);
  return {
    ads: {
      enabled: bool(ads?.enabled, current.ads.enabled),
      bannerUnitId: /^ca-app-pub-\d+\/\d+$/.test(banner) ? banner : "",
    },
    poker: { autoDealDefault: bool(poker?.autoDealDefault, current.poker.autoDealDefault) },
    update: {
      minVersion: /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(minVersion) ? minVersion : "",
      force: bool(update?.force, false),
      iosUrl: httpsUrl(update?.iosUrl),
      androidUrl: httpsUrl(update?.androidUrl),
    },
    announcement: text(record.announcement, 280).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""),
    names: { embedded: terms(names?.embedded), words: terms(names?.words) },
  };
}

export async function loadRemoteConfig() {
  try {
    const response = await fetch(`${API_URL}/api/config`);
    if (!response.ok) return;
    const next = apply(await response.json());
    current = next;
    setNameExtras(next.names.embedded, next.names.words);
    listeners.forEach((listener) => listener());
  } catch {
    // The built-in values stay in place when the config cannot be reached.
  }
}

export function appVersion() {
  const version = Constants.expoConfig?.version ?? "";
  return /^\d+\.\d+\.\d+/.test(version) ? version : "";
}

/** `ask` can be dismissed. `force` blocks opening or joining a table. */
export function updateMode(): "ok" | "ask" | "force" {
  const { minVersion, force } = current.update;
  const version = appVersion();
  if (!minVersion || !version) return "ok";
  if (compareVersions(version, minVersion) >= 0) return "ok";
  return force ? "force" : "ask";
}

export function storeUrl() {
  if (Platform.OS === "ios") return current.update.iosUrl;
  if (Platform.OS === "android") return current.update.androidUrl;
  return current.update.androidUrl || current.update.iosUrl;
}
