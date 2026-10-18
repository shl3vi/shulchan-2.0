import { useEffect, useState } from "react";
import mobileAds, { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";

const bannerUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_ID ?? TestIds.BANNER;

let started: Promise<unknown> | null = null;

function startAds() {
  started ??= mobileAds().initialize();
  return started;
}

export function AdBannerView() {
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
  return <BannerAd unitId={bannerUnitId} size={BannerAdSize.BANNER} />;
}
