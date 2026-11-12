import { useEffect, useState, type ComponentType } from "react";
import { NativeModules } from "react-native";
import { useRemoteConfig } from "@/game/UpdateNotice";

/** Expo Go has no AdMob native module, so the banner stays out of that binary. */
const adsSupported = NativeModules.RNGoogleMobileAdsModule != null;

export function AdBanner() {
  const config = useRemoteConfig();
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!adsSupported || !config.ads.enabled) return;
    let live = true;
    void import("@/ads/AdBannerView").then((mod) => {
      if (live) setBanner(() => mod.AdBannerView);
    });
    return () => {
      live = false;
    };
  }, [config.ads.enabled]);

  if (!config.ads.enabled || !Banner) return null;
  return <Banner />;
}
