import { Stack } from "expo-router";
import { GameSessionProvider } from "@/game/GameSession";

export default function RootLayout() {
  return (
    <GameSessionProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="table" options={{ headerShown: false }} />
      </Stack>
    </GameSessionProvider>
  );
}
