import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { Card } from "@/game/types";

export type SeatSlot = {
  name: string;
  stack: number;
  bet: number;
  holeCards: Card[];
  faceDown: boolean;
  toAct: boolean;
  isYou: boolean;
};

const SEAT_SPOTS = [
  { top: "78%", left: "36%" },
  { top: "64%", left: "4%" },
  { top: "40%", left: "0%" },
  { top: "16%", left: "4%" },
  { top: "0%", left: "20%" },
  { top: "0%", left: "52%" },
  { top: "16%", left: "68%" },
  { top: "40%", left: "72%" },
  { top: "64%", left: "68%" },
] as const;

const suitMark: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function isRed(suit: string) {
  return suit === "hearts" || suit === "diamonds";
}

function PlayingCard({ card, back }: { card?: Card; back?: boolean }) {
  if (back) {
    return (
      <View style={[styles.card, styles.cardBack]}>
        <Text style={styles.cardBackMark}>♠</Text>
      </View>
    );
  }
  if (!card) return <View style={[styles.card, styles.cardEmpty]} />;
  const red = isRed(card.suit);
  return (
    <View style={styles.card}>
      <Text style={[styles.cardRank, red && styles.red]}>{card.rank}</Text>
      <Text style={[styles.cardSuit, red && styles.red]}>{suitMark[card.suit] ?? card.suit}</Text>
    </View>
  );
}

function Chip({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{amount}</Text>
    </View>
  );
}

export function PokerTableLayout({
  seats,
  community,
  pot,
  round,
}: {
  seats: Array<SeatSlot | undefined>;
  community: Card[];
  pot: number;
  round: string | null;
}) {
  return (
    <View style={styles.feltWrap}>
      <View style={styles.rail}>
        <View style={styles.felt}>
          <Text style={styles.round}>{round ?? "waiting"}</Text>
          <View style={styles.board}>
            {Array.from({ length: 5 }, (_, index) => (
              <PlayingCard key={index} card={community[index]} />
            ))}
          </View>
          <View style={styles.moneyLine}>
            <Text style={styles.potLabel}>{pot}</Text>
            <Chip amount={pot} />
          </View>
        </View>
      </View>
      {SEAT_SPOTS.map((spot, index) => {
        const seat = seats[index];
        return (
          <View key={index} style={[styles.seat, spot, seat?.toAct && styles.seatTurn, seat?.isYou && styles.seatYou]}>
            <View style={styles.seatTop}>
              <View style={styles.cardsCol}>
                {seat?.faceDown ? (
                  <>
                    <PlayingCard back />
                    <PlayingCard back />
                  </>
                ) : (
                  <>
                    <PlayingCard card={seat?.holeCards[0]} />
                    <PlayingCard card={seat?.holeCards[1]} />
                  </>
                )}
              </View>
              <View style={styles.video} />
              <View style={styles.betBadge}>
                <Text style={styles.betBadgeText}>{seat?.bet ?? 0}</Text>
              </View>
            </View>
            <View style={styles.moneyLine}>
              <Text style={styles.seatStack}>{seat ? seat.stack : "—"}</Text>
              <Text style={styles.seatName} numberOfLines={1}>
                {seat?.name ?? "Empty"}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  feltWrap: { height: 520, marginHorizontal: 4 },
  rail: {
    position: "absolute",
    top: "18%",
    left: "12%",
    right: "12%",
    bottom: "18%",
    borderRadius: 180,
    backgroundColor: "#5c3b16",
    padding: 8,
  },
  felt: {
    flex: 1,
    borderRadius: 170,
    backgroundColor: "#1f7a45",
    borderWidth: 3,
    borderColor: "#d6b25e",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  round: { color: "#d1fae5", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  board: { flexDirection: "row", gap: 4 },
  moneyLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  potLabel: { color: "#ecfccb", fontWeight: "700", fontSize: 12 },
  card: {
    width: 22,
    height: 32,
    borderRadius: 4,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmpty: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#166534" },
  cardBack: { backgroundColor: "#1e3a8a" },
  cardBackMark: { color: "#93c5fd", fontSize: 14 },
  cardRank: { fontSize: 12, fontWeight: "800", color: "#1c1917" },
  cardSuit: { fontSize: 11, color: "#1c1917" },
  red: { color: "#b91c1c" },
  chip: {
    minWidth: 22,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#b45309",
    borderWidth: 2,
    borderColor: "#fde68a",
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { color: "white", fontSize: 11, fontWeight: "700" },
  seat: {
    position: "absolute",
    width: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#a8a29e",
    backgroundColor: "#1c1917",
    padding: 4,
    gap: 3,
  },
  seatTurn: { borderColor: "#fbbf24", borderWidth: 2 },
  seatYou: { backgroundColor: "#292524" },
  seatTop: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  cardsCol: { gap: 2 },
  video: {
    flex: 1,
    height: 66,
    borderRadius: 6,
    backgroundColor: "#292524",
    borderWidth: 1,
    borderColor: "#57534e",
  },
  betBadge: {
    position: "absolute",
    top: -8,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fde68a",
    alignItems: "center",
    justifyContent: "center",
  },
  betBadgeText: { color: "#1c1917", fontSize: 10, fontWeight: "800" },
  seatName: { color: "white", fontWeight: "600", fontSize: 12 },
  seatStack: { color: "#fbbf24", fontSize: 11 },
});

export function ActionDock({
  amount,
  onAmount,
  onAction,
  onTalk,
}: {
  amount: string;
  onAmount: (value: string) => void;
  onAction: (action: "fold" | "check" | "call" | "bet" | "raise") => void;
  onTalk: () => void;
}) {
  return (
    <View style={dock.bar}>
      <View style={dock.row}>
        {(["fold", "check", "call"] as const).map((action) => (
          <Pressable key={action} style={dock.button} onPress={() => onAction(action)}>
            <Text style={dock.buttonText}>{action}</Text>
          </Pressable>
        ))}
        <Pressable style={dock.talk} onPress={onTalk}>
          <SymbolView name="mic.fill" size={18} tintColor="white" />
        </Pressable>
      </View>
      <View style={dock.row}>
        <TextInput
          style={dock.amount}
          value={amount}
          onChangeText={onAmount}
          keyboardType="number-pad"
          placeholder="amount"
          placeholderTextColor="#a8a29e"
        />
        <Pressable style={dock.button} onPress={() => onAction("bet")}>
          <Text style={dock.buttonText}>bet</Text>
        </Pressable>
        <Pressable style={dock.button} onPress={() => onAction("raise")}>
          <Text style={dock.buttonText}>raise</Text>
        </Pressable>
      </View>
    </View>
  );
}

const dock = StyleSheet.create({
  bar: { gap: 6, paddingHorizontal: 8 },
  row: { flexDirection: "row", gap: 6 },
  button: {
    flex: 1,
    backgroundColor: "#1c1917",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#44403c",
    paddingVertical: 8,
    alignItems: "center",
  },
  talk: {
    flex: 1,
    backgroundColor: "#1e3a8a",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
  amount: {
    flex: 1.4,
    borderWidth: 1,
    borderColor: "#44403c",
    borderRadius: 8,
    color: "white",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
