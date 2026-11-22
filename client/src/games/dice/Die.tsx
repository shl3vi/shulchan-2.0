import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "@/i18n";

/** Where the pips sit on a 3 by 3 grid, for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

/** A die face drawn with pips. Small ones label the upper boxes on the scorecard. */
export function DieFace({ face, size, tone = "ivory" }: { face: number; size: number; tone?: "ivory" | "ghost" | "gold" }) {
  const pip = Math.max(3, Math.round(size * 0.17));
  const inset = size * 0.2;
  const step = (size - inset * 2) / 2;
  return (
    <View
      style={[
        styles.face,
        { width: size, height: size, borderRadius: size * 0.22 },
        tone === "ghost" ? styles.faceGhost : tone === "gold" ? styles.faceGold : null,
        size < 30 ? styles.faceSmall : null,
      ]}
    >
      {(PIPS[face] ?? []).map(([col, row], index) => (
        <View
          key={index}
          style={[
            styles.pip,
            tone === "ghost" ? styles.pipGhost : null,
            face === 1 && tone === "ivory" && size >= 30 ? styles.pipAce : null,
            {
              width: pip,
              height: pip,
              borderRadius: pip / 2,
              left: inset + col * step - pip / 2,
              top: inset + row * step - pip / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * One of the five dice in the tray. It tumbles when `rollKey` changes and it is not kept,
 * and lifts onto a gold rest when it is kept.
 */
export function TrayDie({
  index,
  face,
  size,
  held,
  rollKey,
  blank,
  disabled,
  onPress,
  onLanded,
}: {
  /** Its place in the tray, 0 to 4. */
  index: number;
  face: number;
  size: number;
  held: boolean;
  rollKey: number;
  /** Before the first roll of a turn: the dice wait in the tray, dimmed. */
  blank: boolean;
  disabled: boolean;
  onPress: () => void;
  onLanded?: () => void;
}) {
  // While a die tumbles it flashes random faces; otherwise it shows the face it landed on.
  const [tumbleFace, setTumbleFace] = useState<number | null>(null);
  const shown = tumbleFace ?? face;
  const [spin] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(held ? 1 : 0));
  // A small squash as it lands, toward the felt.
  const [settle] = useState(() => new Animated.Value(0));
  const seenRoll = useRef(rollKey);
  const landed = useRef(onLanded);
  useEffect(() => {
    landed.current = onLanded;
  }, [onLanded]);

  useEffect(() => {
    Animated.spring(lift, { toValue: held ? 1 : 0, useNativeDriver: true, friction: 6, tension: 140 }).start();
  }, [held, lift]);

  useEffect(() => {
    if (rollKey === seenRoll.current) return;
    seenRoll.current = rollKey;
    if (held) return;
    const timer = setInterval(() => setTumbleFace(1 + Math.floor(Math.random() * 6)), 70);
    spin.setValue(0);
    const duration = 520 + Math.floor(Math.random() * 260);
    Animated.timing(spin, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      clearInterval(timer);
      setTumbleFace(null);
      settle.setValue(1);
      Animated.spring(settle, { toValue: 0, useNativeDriver: true, friction: 4, tension: 200 }).start();
      landed.current?.();
    });
    return () => clearInterval(timer);
  }, [rollKey, held, spin, settle]);

  // Neighbouring dice spin opposite ways, and each roll flips the direction.
  const way = (rollKey + index) % 2 === 0 ? 1 : -1;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${720 * way}deg`] });
  const hop = spin.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [0, -size * 0.55, -size * 0.12, 0] });
  const rise = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  // The shadow stays on the felt: it shrinks and fades while the die is in the air, and when it is kept.
  const shadowScale = spin.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [1, 0.55, 0.9, 1] });
  const shadowFade = spin.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [1, 0.4, 0.8, 1] });
  const shadowHeld = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const squashX = settle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const squashY = settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: held, disabled }}
      accessibilityLabel={`${shown}${held ? `, ${t("dcKeep")}` : ""}`}
      style={styles.slot}
    >
      <View style={{ width: size, height: size + 6 }}>
        <Animated.View style={{ opacity: shadowHeld }} pointerEvents="none">
          <Animated.View
            style={[styles.contact, { left: size * 0.1, right: size * 0.1, top: size - 2, opacity: Animated.multiply(shadowFade, 0.55), transform: [{ scaleX: shadowScale }] }]}
          />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: rise }, { translateY: hop }, { rotate }] }}>
          <Animated.View style={{ transformOrigin: "50% 100%", transform: [{ scaleX: squashX }, { scaleY: squashY }] }}>
            <View style={[styles.dieShadow, { borderRadius: size * 0.22 }, held ? styles.dieHeld : null, blank ? styles.dieBlank : null]}>
              <DieFace face={shown} size={size} />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
      <View style={[styles.keepTag, held ? styles.keepTagOn : null]}>
        <Text style={[styles.keepText, held ? styles.keepTextOn : null]}>{held ? t("dcKeep") : " "}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: "center", gap: 6 },
  face: {
    backgroundColor: "#fbf6ea",
    backgroundImage: "linear-gradient(155deg, #ffffff 0%, #f6efdf 55%, #e5dac2 100%)",
    borderWidth: 1,
    borderColor: "rgba(120, 96, 60, 0.35)",
    // Edges catch the light on top and left and fall into shade at the bottom and right.
    boxShadow: "inset 0 -4px 0 rgba(120, 96, 60, 0.24), inset 0 2px 0 rgba(255,255,255,0.95), inset 2px 0 0 rgba(255,255,255,0.45), inset -2px 0 0 rgba(120, 96, 60, 0.12)",
  },
  faceSmall: { boxShadow: "none", borderColor: "rgba(120, 96, 60, 0.5)" },
  faceGhost: { backgroundColor: "rgba(200, 206, 255, 0.10)", backgroundImage: "none", borderColor: "rgba(200, 206, 255, 0.35)", boxShadow: "none" },
  faceGold: { backgroundColor: "#f6d36b", backgroundImage: "none", borderColor: "#b8902d" },
  // Pips are drilled in: dark, lit from the lower rim.
  pip: {
    position: "absolute",
    backgroundColor: "#201a2e",
    backgroundImage: "radial-gradient(circle at 45% 65%, #5a5470 0%, #201a2e 60%, #0f0b18 100%)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.75)",
  },
  pipGhost: { backgroundColor: "#c8ceff", backgroundImage: "none", boxShadow: "none" },
  pipAce: { backgroundColor: "#c2272d", backgroundImage: "radial-gradient(circle at 45% 65%, #e8555a 0%, #c2272d 60%, #7d1015 100%)" },
  dieShadow: { boxShadow: "0 3px 5px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.35)" },
  contact: { position: "absolute", height: 9, borderRadius: 5, backgroundColor: "#000000", boxShadow: "0 0 7px rgba(0,0,0,0.9)" },
  dieHeld: {
    borderWidth: 3,
    borderColor: "#f6d36b",
    boxShadow: "0 0 18px rgba(246,211,107,0.55), 0 10px 14px rgba(0,0,0,0.5)",
    margin: -3,
  },
  dieBlank: { opacity: 0.45 },
  keepTag: { minWidth: 46, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  keepTagOn: { backgroundColor: "#f6d36b" },
  keepText: { color: "transparent", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textAlign: "center" },
  keepTextOn: { color: "#1c1917" },
});
