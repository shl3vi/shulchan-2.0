import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActionDock, PokerTableLayout, TableMenu, type SeatSlot } from "@/game/PokerTableLayout";

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
    toAct: true,
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
    toAct: false,
    isYou: false,
  },
];

export default function TableDesignScreen() {
  const [amount, setAmount] = useState("40");
  const [stats, setStats] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Table design</Text>
        <TableMenu
          items={[
            { label: "Statistics", onPress: () => setStats((value) => !value) },
            { label: "Leave game", onPress: () => {} },
            { label: "Share table", onPress: () => {} },
          ]}
        />
      </View>
      {stats ? <Text style={styles.stats}>You 980 · Ada 940 · Pot 60 · Flop</Text> : null}
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
      <ActionDock
        yourTurn
        actions={["fold", "check", "raise"]}
        amount={amount}
        onAmount={setAmount}
        onAction={() => {}}
        onTalk={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0a09", paddingTop: 8, gap: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 2,
  },
  title: { color: "#e7e5e4", fontWeight: "600" },
  stats: { color: "#e7e5e4", paddingHorizontal: 12, fontSize: 13 },
});
