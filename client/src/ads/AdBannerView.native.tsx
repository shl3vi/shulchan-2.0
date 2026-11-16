import { useEffect, useState } from "react";
import { Platform } from "react-native";
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  BannerAd,
  BannerAdSize,
  TestIds,
} from "react-native-google-mobile-ads";
import { remoteConfig } from "@/game/remoteConfig";
import { useRemoteConfig } from "@/game/UpdateNotice";

let started: Promise<boolean> | null = null;
let privacyRequired = false;

/**
 * Google's consent form decides who must be asked (EEA, UK and Switzerland, and the iOS
 * tracking prompt), shows it, and only then may the SDK start and request ads.
 */
export function prepareAds() {
  started ??= (async () => {
    try {
      await AdsConsent.gatherConsent();
    } catch {
      // A form that failed to load leaves the stored answer, which canRequestAds reads below.
    }
    const info = await AdsConsent.getConsentInfo();
    privacyRequired = info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
    if (!info.canRequestAds) return false;
    await mobileAds().setRequestConfiguration({ testDeviceIdentifiers: remoteConfig().ads.testDevices });
    await mobileAds().initialize();
    return true;
  })().catch(() => false);
  return started;
}

/** Where consent was asked, the player must be able to change the answer later. */
export function adPrivacyRequired() {
  return privacyRequired;
}

export async function showAdPrivacyOptions() {
  await AdsConsent.showPrivacyOptionsForm();
  started = null;
  await prepareAds();
}

export function AdBannerView() {
  const config = useRemoteConfig();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void prepareAds().then((ok) => {
      if (live) setReady(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!ready || config.ads.mode === "off") return null;
  const own = Platform.OS === "ios" ? config.ads.iosUnitId : config.ads.androidUnitId;
  // A development build never requests real ads, whatever the server says.
  const unitId = !__DEV__ && config.ads.mode === "live" && own ? own : TestIds.BANNER;
  return <BannerAd key={unitId} unitId={unitId} size={BannerAdSize.BANNER} />;
}
