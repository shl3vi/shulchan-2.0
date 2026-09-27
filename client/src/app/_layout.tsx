import { Stack } from "expo-router";
import { GameSessionProvider } from "@/game/GameSession";

export default function RootLayout() {
  return (
    <GameSessionProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Shulchan" }} />
        <Stack.Screen name="table" options={{ title: "Table" }} />
      </Stack>
    </GameSessionProvider>
  );
}
