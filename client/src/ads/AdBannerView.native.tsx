import { useEffect, useState } from "react";
import mobileAds, { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";
import { useRemoteConfig } from "@/game/UpdateNotice";

let started: Promise<unknown> | null = null;

function startAds() {
  started ??= mobileAds().initialize();
  return started;
}

export function AdBannerView() {
  const config = useRemoteConfig();
  const unitId = config.ads.bannerUnitId || process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || TestIds.BANNER;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    startAds().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!ready) return null;
  return <BannerAd key={unitId} unitId={unitId} size={BannerAdSize.BANNER} />;
}
