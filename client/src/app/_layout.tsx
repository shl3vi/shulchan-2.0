import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { GameSessionProvider, useGameSession } from "@/game/GameSession";

export default function RootLayout() {
  return (
    <GameSessionProvider>
      <Shell />
    </GameSessionProvider>
  );
}

function Shell() {
  const { ready } = useGameSession();
  // Keep the native splash image visible until the seat check finishes.
  // A painted view here would cover that image with another color.
  if (!ready) return <View style={styles.hold} />;
  return <AppStack />;
}

function AppStack() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: styles.home }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="join" />
      <Stack.Screen name="table" />
      <Stack.Screen name="auth" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  hold: { flex: 1, backgroundColor: "transparent" },
  home: { flex: 1, backgroundColor: "#07110d" },
});
