// Metro picks AdBannerView.native.tsx or AdBannerView.web.tsx. TypeScript reads this shape for both.
export declare function prepareAds(): Promise<boolean>;
export declare function adPrivacyRequired(): boolean;
export declare function showAdPrivacyOptions(): Promise<void>;
export declare function AdBannerView(): import("react").ReactElement | null;
