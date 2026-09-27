import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useGameSession } from "@/game/GameSession";

export default function HomeScreen() {
  const router = useRouter();
  const session = useGameSession();
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState("");
  const [smallBlind, setSmallBlind] = useState("1");
  const [buyIn, setBuyIn] = useState("100");
  const [error, setError] = useState<string | null>(null);

  async function enter(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
      router.push("/table");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server");
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.label}>Your name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />

      <Text style={styles.label}>Join a table</Text>
      <TextInput
        style={styles.input}
        value={gameId}
        onChangeText={setGameId}
        autoCapitalize="none"
        placeholder="Game id"
      />
      <Pressable
        style={styles.button}
        onPress={() => enter(() => session.join(name, gameId))}
      >
        <Text style={styles.buttonText}>Join</Text>
      </Pressable>

      <Text style={styles.label}>Or open a new table</Text>
      <TextInput style={styles.input} value={smallBlind} onChangeText={setSmallBlind} keyboardType="number-pad" />
      <TextInput style={styles.input} value={buyIn} onChangeText={setBuyIn} keyboardType="number-pad" />
      <Pressable
        style={styles.button}
        onPress={() =>
          enter(() => session.createAndSit(name, Number(smallBlind), Number(buyIn)))
        }
      >
        <Text style={styles.buttonText}>Create</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 8 },
  label: { marginTop: 12, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#d6d3d1", borderRadius: 8, padding: 10 },
  button: { backgroundColor: "#1c1917", borderRadius: 8, padding: 12, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "600" },
  error: { color: "#b91c1c", marginTop: 8 },
});
