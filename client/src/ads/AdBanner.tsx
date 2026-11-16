import { useEffect, useState, type ComponentType } from "react";
import { NativeModules } from "react-native";
import { remoteConfig } from "@/game/remoteConfig";
import { useRemoteConfig } from "@/game/UpdateNotice";

/** Expo Go has no AdMob native module, so the banner stays out of that binary. */
const adsSupported = NativeModules.RNGoogleMobileAdsModule != null;

/** Run at launch, so a consent form appears on the home screen and not in the middle of a hand. */
export async function warmUpAds() {
  if (!adsSupported || remoteConfig().ads.mode === "off") return;
  const mod = await import("@/ads/AdBannerView");
  await mod.prepareAds();
}

/** The "change my ad choices" action, or null when this player was never asked. */
export async function adPrivacyAction() {
  if (!adsSupported) return null;
  const mod = await import("@/ads/AdBannerView");
  return mod.adPrivacyRequired() ? mod.showAdPrivacyOptions : null;
}

export function AdBanner() {
  const config = useRemoteConfig();
  const on = config.ads.mode !== "off";
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!adsSupported || !on) return;
    let live = true;
    void import("@/ads/AdBannerView").then((mod) => {
      if (live) setBanner(() => mod.AdBannerView);
    });
    return () => {
      live = false;
    };
  }, [on]);

  if (!on || !Banner) return null;
  return <Banner />;
}
