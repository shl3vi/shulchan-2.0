import { DEFAULT_TURN_SECONDS, MAX_TURN_SECONDS, MIN_TURN_SECONDS } from "./games/poker/turn.js";

export type AdsMode = "off" | "test" | "live";

/** How one phone captures and sends its camera. A seat tile is small, so this stays low. */
export type VideoQuality = { width: number; height: number; frameRate: number; maxKbps: number };

export type PublicConfig = {
  /** off: no banner. test: Google's sample banner. live: this app's own ad units. */
  ads: { mode: AdsMode; androidUnitId: string; iosUnitId: string; testDevices: string[] };
  /** turnSecondsDefault: how long each player has to act at a new poker table. */
  poker: { autoDealDefault: boolean; turnSecondsDefault: number };
  video: { poker: VideoQuality; backgammon: VideoQuality };
  update: { minVersion: string; force: boolean; iosUrl: string; androidUrl: string };
  announcement: string;
  names: { embedded: string[]; words: string[] };
};

/** The config for phones whose region has no entry of its own, and one entry per region code. */
export type PublicConfigSet = {
  default: PublicConfig;
  regions: Record<string, PublicConfig>;
};

/** What the phone gets from GET /api/config when PUBLIC_CONFIG leaves a field out. */
export const defaultPublicConfig: PublicConfig = {
  ads: { mode: "test", androidUnitId: "", iosUnitId: "", testDevices: [] },
  poker: { autoDealDefault: true, turnSecondsDefault: DEFAULT_TURN_SECONDS },
  video: {
    poker: { width: 320, height: 240, frameRate: 15, maxKbps: 150 },
    backgammon: { width: 320, height: 240, frameRate: 15, maxKbps: 150 },
  },
  update: { minVersion: "", force: false, iosUrl: "", androidUrl: "" },
  announcement: "",
  names: { embedded: [], words: [] },
};

const REGION = /^[A-Z]{2}$/;
const CONFIG_KEYS = ["ads", "poker", "video", "update", "announcement", "names"];

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** A whole number inside the range, or the fallback for anything else. */
function int(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function videoQuality(value: unknown, fallback: VideoQuality): VideoQuality {
  const body = object(value);
  return {
    width: int(body?.width, 160, 1280, fallback.width),
    height: int(body?.height, 120, 720, fallback.height),
    frameRate: int(body?.frameRate, 5, 30, fallback.frameRate),
    maxKbps: int(body?.maxKbps, 50, 2000, fallback.maxKbps),
  };
}

function httpsUrl(value: unknown) {
  const raw = text(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function version(value: unknown) {
  const raw = text(value, 20);
  return /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(raw) ? raw : "";
}

function unitId(value: unknown) {
  const raw = text(value, 128);
  return /^ca-app-pub-\d+\/\d+$/.test(raw) ? raw : "";
}

function adsMode(ads: Record<string, unknown> | null): AdsMode {
  const mode = ads?.mode;
  if (mode === "off" || mode === "test" || mode === "live") return mode;
  // The older shape only had an on/off switch.
  if (ads?.enabled === false) return "off";
  return defaultPublicConfig.ads.mode;
}

function testDevices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 64))
    .filter((item) => /^[A-Za-z0-9-]{8,64}$/.test(item))
    .slice(0, 20);
}

function announcement(value: unknown) {
  return text(value, 280).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
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

/** One complete config. A field it leaves out takes the built-in value, never another region's. */
export function readOneConfig(value: unknown): PublicConfig {
  const body = object(value);
  if (!body) return defaultPublicConfig;
  const ads = object(body.ads);
  const poker = object(body.poker);
  const update = object(body.update);
  const names = object(body.names);
  const video = object(body.video);
  return {
    ads: {
      mode: adsMode(ads),
      androidUnitId: unitId(ads?.androidUnitId),
      iosUnitId: unitId(ads?.iosUnitId),
      testDevices: testDevices(ads?.testDevices),
    },
    poker: {
      autoDealDefault: bool(poker?.autoDealDefault, defaultPublicConfig.poker.autoDealDefault),
      turnSecondsDefault: int(poker?.turnSecondsDefault, MIN_TURN_SECONDS, MAX_TURN_SECONDS, defaultPublicConfig.poker.turnSecondsDefault),
    },
    video: {
      poker: videoQuality(video?.poker, defaultPublicConfig.video.poker),
      backgammon: videoQuality(video?.backgammon, defaultPublicConfig.video.backgammon),
    },
    update: {
      minVersion: version(update?.minVersion),
      force: bool(update?.force, false),
      iosUrl: httpsUrl(update?.iosUrl),
      androidUrl: httpsUrl(update?.androidUrl),
    },
    announcement: announcement(body.announcement),
    names: {
      embedded: terms(names?.embedded),
      words: terms(names?.words),
    },
  };
}

/**
 * PUBLIC_CONFIG is `{ "default": {...}, "FR": {...}, "IL": {...} }`, each a whole config.
 * A body with config fields at the top is the older single-config shape and becomes the default.
 */
export function readPublicConfig(raw: string | undefined): PublicConfigSet {
  const empty: PublicConfigSet = { default: defaultPublicConfig, regions: {} };
  if (!raw?.trim()) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("PUBLIC_CONFIG is not valid JSON. The app keeps the built-in config.");
    return empty;
  }
  const body = object(parsed);
  if (!body) return empty;
  if (!("default" in body) && CONFIG_KEYS.some((key) => key in body)) {
    return { default: readOneConfig(body), regions: {} };
  }
  const regions: Record<string, PublicConfig> = {};
  for (const [key, value] of Object.entries(body)) {
    const region = key.toUpperCase();
    if (!REGION.test(region)) continue;
    regions[region] = readOneConfig(value);
  }
  return { default: readOneConfig(body.default), regions };
}

/** A two-letter region from the phone's settings, or "" for anything else. */
export function regionOf(value: unknown) {
  const region = typeof value === "string" ? value.trim().toUpperCase() : "";
  return REGION.test(region) ? region : "";
}

let cached: PublicConfigSet | undefined;

export function publicConfigSet() {
  cached ??= readPublicConfig(process.env.PUBLIC_CONFIG);
  return cached;
}

export function publicConfigFor(region: string) {
  const set = publicConfigSet();
  const matched = region && set.regions[region] ? region : "";
  const config = matched ? set.regions[matched]! : set.default;
  return {
    ...config,
    // Builds before the ads mode read these two fields. They keep showing Google's sample banner.
    ads: { ...config.ads, enabled: config.ads.mode !== "off", bannerUnitId: "" },
    region: matched || "default",
  };
}

/** Name filtering runs on the server for every table, so it uses the terms of every region together. */
export function allNameTerms() {
  const set = publicConfigSet();
  const configs = [set.default, ...Object.values(set.regions)];
  return {
    embedded: [...new Set(configs.flatMap((config) => config.names.embedded))],
    words: [...new Set(configs.flatMap((config) => config.names.words))],
  };
}
