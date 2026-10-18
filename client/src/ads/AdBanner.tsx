import { useEffect, useState, type ComponentType } from "react";
import { NativeModules } from "react-native";

/** Expo Go has no AdMob native module, so the banner stays out of that binary. */
const adsSupported = NativeModules.RNGoogleMobileAdsModule != null;

export function AdBanner() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!adsSupported) return;
    let live = true;
    void import("@/ads/AdBannerView").then((mod) => {
      if (live) setBanner(() => mod.AdBannerView);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!Banner) return null;
  return <Banner />;
}
