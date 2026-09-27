import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useGameSession } from "@/game/GameSession";
import { ActionDock, PokerTableLayout, type SeatSlot } from "@/game/PokerTableLayout";

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

  const seats: Array<SeatSlot | undefined> = [];
  for (const player of state?.players ?? []) {
    const isYou = player.id === you?.id;
    seats[player.seat] = {
      name: player.name,
      stack: player.stack,
      bet: player.betSize,
      holeCards: isYou ? (you?.holeCards ?? []) : [],
      faceDown: !isYou && player.inHand,
      toAct: state?.playerToActId === player.id,
      isYou,
    };
  }

  const gameId = credentials.gameId;
  function shareTable() {
    Share.share({ message: `Join my Shulchan table: ${gameId}` });
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.idRow}>
        <Text style={styles.meta} selectable>
          {gameId}
        </Text>
        <Pressable style={styles.share} onPress={shareTable}>
          <Text style={styles.shareText}>Share</Text>
        </Pressable>
      </View>
      <PokerTableLayout
        seats={seats}
        community={state?.communityCards ?? []}
        pot={pot}
        round={state?.round ?? null}
      />
      <Text style={styles.body}>
        Blinds {state?.smallBlind ?? "—"}/{state?.bigBlind ?? "—"}
      </Text>
      {state?.lastWinners.length ? (
        <Text style={styles.body}>
          Last pot: {state.lastWinners.map((winner) => `${winner.name} ${winner.amount}`).join(", ")}
        </Text>
      ) : null}
      {credentials.adminSecret && state?.round == null ? (
        <Pressable style={styles.button} onPress={startHand}>
          <Text style={styles.buttonText}>Deal</Text>
        </Pressable>
      ) : null}
      <ActionDock
        amount={amount}
        onAmount={setAmount}
        onTalk={() => {}}
        onAction={(action) => {
          const legal = you?.legalActions ?? [];
          if (!legal.includes(action)) return;
          act(action, action === "bet" || action === "raise" ? Number(amount) : undefined);
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 10, backgroundColor: "#0c0a09" },
  idRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { flex: 1, fontSize: 12, color: "#d6d3d1" },
  share: { backgroundColor: "#166534", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  shareText: { color: "white", fontWeight: "700" },
  body: { color: "#e7e5e4" },
  board: { fontSize: 22, fontWeight: "700", color: "white" },
  seats: { gap: 4, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { backgroundColor: "#1c1917", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: "white", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#d6d3d1", borderRadius: 8, padding: 10 },
  error: { color: "#b91c1c" },
});
