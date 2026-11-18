import Constants from "expo-constants";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";
import { API_URL } from "@/game/api";
import { setNameExtras } from "@/game/name";
import { compareVersions } from "@/game/version";

export type AdsMode = "off" | "test" | "live";

/** How this phone captures and sends its camera at a table. */
export type VideoQuality = { width: number; height: number; frameRate: number; maxKbps: number };
export type GameKind = "poker" | "backgammon";

export type RemoteConfig = {
  /** off: no banner. test: Google's sample banner. live: this app's own ad units. */
  ads: { mode: AdsMode; androidUnitId: string; iosUnitId: string; testDevices: string[] };
  /** turnSecondsDefault: how long each player has to act at a table this phone opens. */
  poker: { autoDealDefault: boolean; turnSecondsDefault: number };
  video: Record<GameKind, VideoQuality>;
  update: { minVersion: string; force: boolean; iosUrl: string; androidUrl: string };
  announcement: string;
  names: { embedded: string[]; words: string[] };
};

function modeOf(value: unknown): AdsMode | null {
  return value === "off" || value === "test" || value === "live" ? value : null;
}

const fallback: RemoteConfig = {
  // Nothing is shown until the server answers, so a build cannot serve ads its config did not ask for.
  ads: { mode: modeOf(process.env.EXPO_PUBLIC_ADS_MODE) ?? "off", androidUnitId: "", iosUnitId: "", testDevices: [] },
  poker: { autoDealDefault: true, turnSecondsDefault: 30 },
  video: {
    poker: { width: 320, height: 240, frameRate: 15, maxKbps: 150 },
    backgammon: { width: 320, height: 240, frameRate: 15, maxKbps: 150 },
  },
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

function int(value: unknown, min: number, max: number, fallbackValue: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallbackValue;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function videoQuality(value: unknown, fallbackValue: VideoQuality): VideoQuality {
  const body = object(value);
  return {
    width: int(body?.width, 160, 1280, fallbackValue.width),
    height: int(body?.height, 120, 720, fallbackValue.height),
    frameRate: int(body?.frameRate, 5, 30, fallbackValue.frameRate),
    maxKbps: int(body?.maxKbps, 50, 2000, fallbackValue.maxKbps),
  };
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

function unitId(value: unknown) {
  const raw = text(value, 128);
  return /^ca-app-pub-\d+\/\d+$/.test(raw) ? raw : "";
}

function testDevices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 64)).filter((item) => /^[A-Za-z0-9-]{8,64}$/.test(item)).slice(0, 20);
}

/** The region in the phone's settings, such as FR. It is not where the phone is. */
export function phoneRegion() {
  try {
    const region = getLocales()[0]?.regionCode?.toUpperCase() ?? "";
    return /^[A-Z]{2}$/.test(region) ? region : "";
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
  const video = object(record.video);
  const minVersion = text(update?.minVersion, 20);
  return {
    ads: {
      mode: modeOf(ads?.mode) ?? (ads?.enabled === false ? "off" : current.ads.mode),
      androidUnitId: unitId(ads?.androidUnitId),
      iosUnitId: unitId(ads?.iosUnitId),
      testDevices: testDevices(ads?.testDevices),
    },
    poker: {
      autoDealDefault: bool(poker?.autoDealDefault, current.poker.autoDealDefault),
      turnSecondsDefault: int(poker?.turnSecondsDefault, 10, 300, current.poker.turnSecondsDefault),
    },
    video: {
      poker: videoQuality(video?.poker, fallback.video.poker),
      backgammon: videoQuality(video?.backgammon, fallback.video.backgammon),
    },
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
    const region = phoneRegion();
    const response = await fetch(`${API_URL}/api/config${region ? `?region=${region}` : ""}`);
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
