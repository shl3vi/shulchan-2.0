import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { GameSessionProvider, useGameSession } from "@/game/GameSession";
import { warmUpAds } from "@/ads/AdBanner";
import { loadRemoteConfig } from "@/game/remoteConfig";
import { acceptTerms, hasAcceptedTerms } from "@/game/terms";
import { loadLocale, subscribeLocale, locale } from "@/i18n";
import { CrashScreen } from "@/ui/CrashScreen";
import { TermsGate } from "@/ui/TermsGate";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: "#a8b2ff",
    background: "#090b16",
    card: "#14172a",
    text: "#f7f7fc",
    border: "rgba(205, 210, 255, 0.18)",
    notification: "#f3a66f",
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <CrashScreen>
        <GameSessionProvider>
          <Shell />
        </GameSessionProvider>
      </CrashScreen>
    </ThemeProvider>
  );
}

function Shell() {
  const { ready } = useGameSession();
  const [langReady, setLangReady] = useState(false);
  const [terms, setTerms] = useState<boolean | null>(null);
  const currentLocale = useSyncExternalStore(subscribeLocale, locale, locale);
  useEffect(() => {
    void loadLocale().finally(() => setLangReady(true));
    void hasAcceptedTerms().then(setTerms);
    void loadRemoteConfig().then(() => warmUpAds()).catch(() => undefined);
  }, []);
  // Keep the native splash image visible until the seat check finishes.
  // A painted view here would cover that image with another color.
  if (!ready || !langReady || terms === null) return <View style={styles.hold} />;
  if (!terms) {
    return (
      <TermsGate
        key={currentLocale}
        onAccept={() => {
          void acceptTerms();
          setTerms(true);
        }}
      />
    );
  }
  return <AppStack key={currentLocale} />;
}

function AppStack() {
  return (
    <Stack
      activityEnabled={1}
      screenOptions={{
        headerShown: false,
        animation: "simple_push",
        animationDuration: 400,
        animationMatchesGesture: true,
        fullScreenGestureEnabled: true,
        gestureEnabled: true,
        contentStyle: styles.home,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="join" />
      <Stack.Screen name="table" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="support" />
      <Stack.Screen name="legal" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  hold: { flex: 1, backgroundColor: "transparent" },
  home: { flex: 1, backgroundColor: "#090b16" },
});
