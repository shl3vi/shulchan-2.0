import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colorOf, isJoker, numberOf } from "@/games/tiles/rules";

const INK: Record<string, string> = { r: "#d22f27", b: "#1d64c8", o: "#e07b00", k: "#1f1b24" };

/**
 * One tile: an ivory face with its number in colour and a small mark under it, or a joker's face.
 * `fresh` marks a tile placed this turn; `lifted` a tile picked up.
 */
export function Tile({
  tile,
  width,
  lifted,
  fresh,
  dim,
  onPress,
  disabled,
}: {
  tile: string;
  width: number;
  lifted?: boolean;
  fresh?: boolean;
  dim?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const height = Math.round(width * 1.36);
  const joker = isJoker(tile);
  const ink = joker ? (tile === "j1" ? INK.r : INK.k) : INK[colorOf(tile)];
  const face = (
    <View
      style={[
        styles.tile,
        { width, height, borderRadius: Math.max(4, width * 0.16) },
        lifted ? styles.lifted : null,
        fresh && !lifted ? styles.fresh : null,
        dim ? styles.dim : null,
      ]}
    >
      {joker ? (
        <Ionicons name="happy" size={width * 0.62} color={ink} />
      ) : (
        <>
          <Text style={[styles.number, { color: ink, fontSize: width * 0.56, lineHeight: width * 0.66 }]}>{numberOf(tile)}</Text>
          <View style={[styles.mark, { width: width * 0.22, height: width * 0.22, borderRadius: width * 0.11, borderColor: ink }]} />
        </>
      )}
    </View>
  );
  if (!onPress) return face;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={2} accessibilityRole="button" accessibilityState={{ selected: lifted === true }}>
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    backgroundColor: "#fbf5e6",
    backgroundImage: "linear-gradient(170deg, #fffdf6 0%, #f6edd8 60%, #e6d8b8 100%)",
    borderWidth: 1,
    borderColor: "rgba(120, 96, 60, 0.4)",
    boxShadow: "0 2px 0 #cdbb94, 0 4px 6px rgba(0,0,0,0.35)",
  },
  lifted: {
    borderWidth: 2,
    borderColor: "#f6d36b",
    transform: [{ translateY: -6 }],
    boxShadow: "0 0 12px rgba(246,211,107,0.7), 0 8px 10px rgba(0,0,0,0.45)",
  },
  fresh: { borderColor: "#86e3c4", borderWidth: 2 },
  dim: { opacity: 0.45 },
  number: { fontWeight: "900", fontVariant: ["tabular-nums"] },
  mark: { borderWidth: 1.5, opacity: 0.7 },
});
