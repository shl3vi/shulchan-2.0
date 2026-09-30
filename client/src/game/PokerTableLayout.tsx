import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export type PokerAction = "fold" | "check" | "call" | "bet" | "raise";

const SEAT_COUNT = 9;
const SEAT_W = 94;
const SEAT_H = 112;

const suitMark: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function isRed(suit: string) {
  return suit === "hearts" || suit === "diamonds";
}

function PlayingCard({ card, back, large }: { card?: Card; back?: boolean; large?: boolean }) {
  const box = large ? styles.holeCard : styles.card;
  const rank = large ? styles.holeRank : styles.cardRank;
  const suit = large ? styles.holeSuit : styles.cardSuit;
  if (back) {
    return (
      <View style={[box, styles.cardBack]}>
        <Text style={large ? styles.holeBackMark : styles.cardBackMark}>♠</Text>
      </View>
    );
  }
  if (!card) return <View style={[box, styles.cardEmpty]} />;
  const red = isRed(card.suit);
  return (
    <View style={box}>
      <Text style={[rank, red && styles.red]}>{card.rank}</Text>
      <Text style={[suit, red && styles.red]}>{suitMark[card.suit] ?? card.suit}</Text>
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

function MicIcon() {
  return (
    <View style={styles.mic}>
      <View style={styles.micHead} />
      <View style={styles.micArc} />
      <View style={styles.micStem} />
    </View>
  );
}

function seatSize(width: number, height: number) {
  const widthCap = Math.min(SEAT_W, width * 0.28);
  const heightCap = Math.min(SEAT_H, height * 0.2);
  return {
    width: Math.max(90, widthCap),
    height: Math.max(104, heightCap),
  };
}

function seatOrigin(index: number, width: number, height: number, seatW: number, seatH: number) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(0, (width - seatW) / 2);
  const ry = Math.max(0, (height - seatH) / 2);
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / SEAT_COUNT;
  return {
    left: cx + rx * Math.cos(angle) - seatW / 2,
    top: cy + ry * Math.sin(angle) - seatH / 2,
  };
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
  const [size, setSize] = useState({ width: 0, height: 0 });
  const seat = seatSize(size.width, size.height);

  return (
    <View
      style={styles.feltWrap}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      <View
        style={[
          styles.rail,
          {
            top: size.height * 0.2,
            bottom: size.height * 0.2,
            left: size.width * 0.2,
            right: size.width * 0.2,
          },
        ]}
      >
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
      {size.width > 0 &&
        Array.from({ length: SEAT_COUNT }, (_, index) => {
          const player = seats[index];
          const spot = seatOrigin(index, size.width, size.height, seat.width, seat.height);
          return (
            <View
              key={index}
              style={[
                styles.seat,
                spot,
                { width: seat.width, height: seat.height },
                player?.toAct && styles.seatTurn,
                player?.isYou && styles.seatYou,
              ]}
            >
              <View style={styles.seatTop}>
                <View style={styles.cardsCol}>
                  {player?.faceDown ? (
                    <>
                      <PlayingCard back large />
                      <PlayingCard back large />
                    </>
                  ) : (
                    <>
                      <PlayingCard card={player?.holeCards?.[0]} large />
                      <PlayingCard card={player?.holeCards?.[1]} large />
                    </>
                  )}
                </View>
                <View style={styles.video} />
                <View style={styles.betBadge}>
                  <Text style={styles.betBadgeText}>{player?.bet ?? 0}</Text>
                </View>
              </View>
              <View style={styles.moneyLine}>
                <Text style={styles.seatStack}>{player ? player.stack : "—"}</Text>
                <Text style={styles.seatName} numberOfLines={1}>
                  {player?.name ?? "Empty"}
                </Text>
              </View>
            </View>
          );
        })}
    </View>
  );
}

export function ActionDock({
  actions,
  yourTurn,
  amount,
  onAmount,
  onAction,
  onTalk,
}: {
  actions: PokerAction[];
  yourTurn: boolean;
  amount: string;
  onAmount: (value: string) => void;
  onAction: (action: PokerAction) => void;
  onTalk: () => void;
}) {
  const quiet = actions.filter((action) => action !== "bet" && action !== "raise");
  const sized = actions.filter((action) => action === "bet" || action === "raise");
  const insets = useSafeAreaInsets();

  return (
    <View style={[dock.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={dock.actions}>
        {yourTurn ? (
          <>
            <View style={dock.row}>
              {quiet.map((action) => (
                <Pressable key={action} style={dock.button} onPress={() => onAction(action)}>
                  <Text style={dock.buttonText}>{action}</Text>
                </Pressable>
              ))}
            </View>
            {sized.length > 0 ? (
              <View style={dock.row}>
                <TextInput
                  style={dock.amount}
                  value={amount}
                  onChangeText={onAmount}
                  keyboardType="number-pad"
                  placeholder="amount"
                  placeholderTextColor="#a8a29e"
                />
                {sized.map((action) => (
                  <Pressable key={action} style={dock.button} onPress={() => onAction(action)}>
                    <Text style={dock.buttonText}>{action}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={dock.wait}>Waiting</Text>
        )}
      </View>
      <Pressable style={dock.mic} onPress={onTalk}>
        <MicIcon />
      </Pressable>
    </View>
  );
}

export function TableMenu({
  items,
}: {
  items: { label: string; onPress: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={menu.wrap}>
      <Pressable style={menu.button} onPress={() => setOpen((value) => !value)}>
        <Text style={menu.buttonText}>Menu</Text>
      </Pressable>
      {open ? (
        <View style={menu.panel}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              style={menu.item}
              onPress={() => {
                setOpen(false);
                item.onPress();
              }}
            >
              <Text style={menu.itemText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  feltWrap: { flex: 1, minHeight: 0, marginHorizontal: 2 },
  rail: {
    position: "absolute",
    borderRadius: 200,
    backgroundColor: "#5c3b16",
    padding: 8,
  },
  felt: {
    flex: 1,
    borderRadius: 190,
    backgroundColor: "#1f7a45",
    borderWidth: 3,
    borderColor: "#d6b25e",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  round: { color: "#d1fae5", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  board: { flexDirection: "row", gap: 3 },
  moneyLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  potLabel: { color: "#ecfccb", fontWeight: "700", fontSize: 12 },
  card: {
    width: 16,
    height: 22,
    borderRadius: 3,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmpty: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#166534" },
  cardBack: { backgroundColor: "#1e3a8a" },
  cardBackMark: { color: "#93c5fd", fontSize: 11 },
  cardRank: { fontSize: 10, fontWeight: "800", color: "#1c1917" },
  cardSuit: { fontSize: 9, color: "#1c1917" },
  holeCard: {
    width: 28,
    height: 36,
    borderRadius: 4,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  holeRank: { fontSize: 14, fontWeight: "800", color: "#1c1917" },
  holeSuit: { fontSize: 13, color: "#1c1917" },
  holeBackMark: { color: "#93c5fd", fontSize: 16 },
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
  chipText: { color: "white", fontSize: 10, fontWeight: "700" },
  seat: {
    position: "absolute",
    width: SEAT_W,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a8a29e",
    backgroundColor: "#1c1917",
    padding: 4,
    gap: 2,
  },
  seatTurn: { borderColor: "#fbbf24", borderWidth: 2 },
  seatYou: { backgroundColor: "#292524" },
  seatTop: { flex: 1, flexDirection: "row", alignItems: "stretch", gap: 3 },
  cardsCol: { gap: 2 },
  video: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: "#292524",
    borderWidth: 1,
    borderColor: "#57534e",
  },
  betBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 3,
    backgroundColor: "#fde68a",
    alignItems: "center",
    justifyContent: "center",
  },
  betBadgeText: { color: "#1c1917", fontSize: 9, fontWeight: "800" },
  seatName: { flex: 1, color: "white", fontWeight: "600", fontSize: 11 },
  seatStack: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  mic: { width: 18, height: 24, alignItems: "center" },
  micHead: { width: 8, height: 12, borderRadius: 4, backgroundColor: "white" },
  micArc: {
    width: 14,
    height: 8,
    marginTop: -4,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  micStem: { width: 2, height: 5, backgroundColor: "white" },
});

const dock = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 },
  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1e3a8a",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flex: 1, gap: 6, justifyContent: "center" },
  row: { flexDirection: "row", gap: 6 },
  button: {
    flex: 1,
    backgroundColor: "#1c1917",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#44403c",
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "700", fontSize: 13, textTransform: "capitalize" },
  amount: {
    flex: 1.4,
    borderWidth: 1,
    borderColor: "#44403c",
    borderRadius: 8,
    color: "white",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wait: { color: "#a8a29e", fontSize: 14 },
});

const menu = StyleSheet.create({
  wrap: { alignItems: "flex-end" },
  button: {
    borderWidth: 1,
    borderColor: "#44403c",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: { color: "#fafaf9", fontWeight: "700", fontSize: 12 },
  panel: {
    position: "absolute",
    top: 36,
    right: 0,
    zIndex: 5,
    minWidth: 160,
    backgroundColor: "#1c1917",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#44403c",
    overflow: "hidden",
  },
  item: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#292524" },
  itemText: { color: "white", fontSize: 14 },
});
