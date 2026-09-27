import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActionDock, PokerTableLayout, type SeatSlot } from "@/game/PokerTableLayout";

const seats: Array<SeatSlot | undefined> = [
  {
    name: "You",
    stack: 980,
    bet: 20,
    holeCards: [
      { rank: "K", suit: "hearts" },
      { rank: "9", suit: "diamonds" },
    ],
    faceDown: false,
    toAct: false,
    isYou: true,
  },
  undefined,
  undefined,
  {
    name: "Ada",
    stack: 940,
    bet: 40,
    holeCards: [],
    faceDown: true,
    toAct: true,
    isYou: false,
  },
];

export default function TableDesignScreen() {
  const [amount, setAmount] = useState("40");
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Table design</Text>
      <PokerTableLayout
        seats={seats}
        round="flop"
        pot={60}
        community={[
          { rank: "A", suit: "spades" },
          { rank: "K", suit: "clubs" },
          { rank: "7", suit: "diamonds" },
        ]}
      />
      <ActionDock amount={amount} onAmount={setAmount} onAction={() => {}} onTalk={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0a09", paddingTop: 12 },
  title: { color: "#e7e5e4", textAlign: "center", marginBottom: 8, fontWeight: "600" },
});
