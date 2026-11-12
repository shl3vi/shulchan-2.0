export type PublicConfig = {
  ads: { enabled: boolean; bannerUnitId: string };
  poker: { autoDealDefault: boolean };
  update: { minVersion: string; force: boolean; iosUrl: string; androidUrl: string };
  announcement: string;
  names: { embedded: string[]; words: string[] };
};

/** What the phone gets from GET /api/config. Override any field with the PUBLIC_CONFIG env JSON. */
export const defaultPublicConfig: PublicConfig = {
  ads: { enabled: true, bannerUnitId: "" },
  poker: { autoDealDefault: true },
  update: { minVersion: "", force: false, iosUrl: "", androidUrl: "" },
  announcement: "",
  names: { embedded: [], words: [] },
};

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

function bannerId(value: unknown) {
  const raw = text(value, 128);
  return /^ca-app-pub-\d+\/\d+$/.test(raw) ? raw : "";
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

export function readPublicConfig(raw: string | undefined): PublicConfig {
  if (!raw?.trim()) return defaultPublicConfig;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("PUBLIC_CONFIG is not valid JSON. The app keeps the built-in config.");
    return defaultPublicConfig;
  }
  const body = object(parsed);
  if (!body) return defaultPublicConfig;
  const ads = object(body.ads);
  const poker = object(body.poker);
  const update = object(body.update);
  const names = object(body.names);
  return {
    ads: {
      enabled: bool(ads?.enabled, defaultPublicConfig.ads.enabled),
      bannerUnitId: ads && "bannerUnitId" in ads ? bannerId(ads.bannerUnitId) : "",
    },
    poker: {
      autoDealDefault: bool(poker?.autoDealDefault, defaultPublicConfig.poker.autoDealDefault),
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

let cached: PublicConfig | undefined;

export function publicConfig() {
  cached ??= readPublicConfig(process.env.PUBLIC_CONFIG);
  return cached;
}
