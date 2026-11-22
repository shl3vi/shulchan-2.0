import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colorOf, isJoker, numberOf } from "@/games/tiles/rules";

const INK: Record<string, string> = { r: "#d22f27", b: "#1d64c8", o: "#e07b00", k: "#1f1b24" };

/**
 * One tile: an ivory face with its number in colour and a small mark under it, or a joker's face.
 * `fresh` marks a tile placed or drawn this turn, which pops as it arrives; `lifted` a tile picked up,
 * which rises on a spring.
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
  const [rise] = useState(() => new Animated.Value(lifted ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(fresh ? 1 : 0));

  useEffect(() => {
    Animated.spring(rise, { toValue: lifted ? 1 : 0, useNativeDriver: true, friction: 6, tension: 220 }).start();
  }, [lifted, rise]);

  useEffect(() => {
    if (!fresh) return;
    pop.setValue(1);
    Animated.spring(pop, { toValue: 0, useNativeDriver: true, friction: 5, tension: 170 }).start();
  }, [fresh, pop]);

  const face = (
    <Animated.View
      style={[
        styles.tile,
        { width, height, borderRadius: Math.max(4, width * 0.16) },
        lifted ? styles.lifted : null,
        fresh && !lifted ? styles.fresh : null,
        dim ? styles.dim : null,
        {
          transform: [
            { translateY: Animated.add(rise.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }), pop.interpolate({ inputRange: [0, 1], outputRange: [0, -10] })) },
            { scale: Animated.add(rise.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }), pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] })) },
          ],
        },
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
    </Animated.View>
  );
  if (!onPress) return face;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={2} accessibilityRole="button" accessibilityState={{ selected: lifted === true }}>
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A thick ivory tile: its edge shows below the face, with a highlight on top and a soft shadow on the felt.
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    backgroundColor: "#fbf5e6",
    backgroundImage: "linear-gradient(170deg, #fffdf6 0%, #f6edd8 60%, #e6d8b8 100%)",
    borderWidth: 1,
    borderColor: "rgba(120, 96, 60, 0.4)",
    boxShadow: "0 3px 0 #b8a272, 0 5px 7px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -2px 0 rgba(150,120,70,0.16)",
  },
  lifted: {
    borderWidth: 2,
    borderColor: "#f6d36b",
    boxShadow: "0 3px 0 #b8a272, 0 0 12px rgba(246,211,107,0.7), 0 12px 12px rgba(0,0,0,0.45)",
  },
  fresh: { borderColor: "#86e3c4", borderWidth: 2 },
  dim: { opacity: 0.45 },
  // The number is pressed into the ivory: a light edge under it.
  number: {
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  mark: { borderWidth: 1.5, opacity: 0.7 },
});
