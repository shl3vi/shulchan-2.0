import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useGameSession } from "@/game/GameSession";

const suitMark: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function cards(list: { rank: string; suit: string }[]) {
  if (list.length === 0) return "—";
  return list.map((card) => `${card.rank}${suitMark[card.suit] ?? card.suit}`).join(" ");
}

export default function TableScreen() {
  const { credentials, state, error, startHand, act } = useGameSession();
  const [amount, setAmount] = useState("");
  const you = state?.you;
  const pot = state?.pots.reduce((sum, entry) => sum + entry.size, 0) ?? 0;

  if (!credentials) {
    return (
      <View style={styles.screen}>
        <Text>Sit down from the home screen first.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.meta}>Table {credentials.gameId}</Text>
      <Text>
        Blinds {state?.smallBlind ?? "—"}/{state?.bigBlind ?? "—"} · Pot {pot}
        {state?.round ? ` · ${state.round}` : ""}
      </Text>
      <Text style={styles.board}>{cards(state?.communityCards ?? [])}</Text>
      <Text>Your cards {cards(you?.holeCards ?? [])}</Text>
      {state?.lastWinners.length ? (
        <Text>
          Last pot: {state.lastWinners.map((winner) => `${winner.name} ${winner.amount}`).join(", ")}
        </Text>
      ) : null}
      <View style={styles.seats}>
        {state?.players.map((player) => (
          <Text key={player.id}>
            {player.name} · {player.stack}
            {player.betSize ? ` (bet ${player.betSize})` : ""}
            {state.playerToActId === player.id ? " · to act" : ""}
          </Text>
        ))}
      </View>
      {credentials.adminSecret && state?.round == null ? (
        <Pressable style={styles.button} onPress={startHand}>
          <Text style={styles.buttonText}>Deal</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        {you?.legalActions.map((action) => (
          <Pressable
            key={action}
            style={styles.button}
            onPress={() => act(action, action === "bet" || action === "raise" ? Number(amount) : undefined)}
          >
            <Text style={styles.buttonText}>{action}</Text>
          </Pressable>
        ))}
      </View>
      {you?.chipRange ? (
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder={`${you.chipRange.min}–${you.chipRange.max}`}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 10 },
  meta: { fontSize: 12, color: "#57534e" },
  board: { fontSize: 22, fontWeight: "700" },
  seats: { gap: 4, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: "#1c1917", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: "white", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#d6d3d1", borderRadius: 8, padding: 10 },
  error: { color: "#b91c1c" },
});
