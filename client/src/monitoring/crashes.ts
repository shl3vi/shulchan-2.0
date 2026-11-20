import PostHog from "posthog-react-native";
import { Platform } from "react-native";

/** Crash reports per app launch. One broken screen can't send more than this. */
const MAX_REPORTS = 3;

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? "";
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
// Dev builds stay quiet unless EXPO_PUBLIC_POSTHOG_DEV=1, so a crash on a laptop doesn't land in the dashboard.
const enabled = key !== "" && (!__DEV__ || process.env.EXPO_PUBLIC_POSTHOG_DEV === "1");

let sent = 0;

/**
 * PostHog is here for crash reports only: no usage events, screens, app open events, feature flags, surveys,
 * session replay or person profiles. The filter drops anything that isn't a crash, so nothing else can slip out.
 */
export const crashes = enabled
  ? new PostHog(key, {
      host,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      disableSurveys: true,
      personProfiles: "never",
      disableGeoip: true,
      errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: [] } },
      before_send: (event) => {
        if (event.event !== "$exception" || sent >= MAX_REPORTS) return null;
        sent += 1;
        return event;
      },
    })
  : null;

export function reportCrash(error: unknown, where: string) {
  // platform is ios, android or web, so a crash in the browser build can be told apart.
  crashes?.captureException(error, { where, platform: Platform.OS });
}
