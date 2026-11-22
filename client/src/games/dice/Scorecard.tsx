import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { DieFace } from "@/games/dice/Die";
import {
  bestBox,
  LOWER,
  scoreFor,
  totalOf,
  UPPER,
  UPPER_BONUS,
  UPPER_BONUS_AT,
  upperTotal,
  type Category,
  type DicePlayer,
} from "@/games/dice/scoring";
import { t, type MessageKey } from "@/i18n";

const LABEL: Record<(typeof LOWER)[number], MessageKey> = {
  threeKind: "dcThreeKind",
  fourKind: "dcFourKind",
  fullHouse: "dcFullHouse",
  smallStraight: "dcSmallStraight",
  largeStraight: "dcLargeStraight",
  fiveKind: "dcFiveKind",
  chance: "dcChance",
};

const UPPER_LABEL: Record<(typeof UPPER)[number], MessageKey> = {
  ones: "dcOnes",
  twos: "dcTwos",
  threes: "dcThrees",
  fours: "dcFours",
  fives: "dcFives",
  sixes: "dcSixes",
};

/** A box that was just scored glows once, so everyone at the table sees where the points went. */
function useFlash(active: boolean) {
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    glow.setValue(1);
    Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: false }).start();
  }, [active, glow]);
  return glow;
}

function Box({
  category,
  player,
  dice,
  preview,
  selectable,
  selected,
  suggested,
  flash,
  onSelect,
  children,
}: {
  category: Category;
  player: DicePlayer;
  dice: number[];
  preview: boolean;
  selectable: boolean;
  selected: boolean;
  suggested: boolean;
  flash: boolean;
  onSelect: (category: Category) => void;
  children: React.ReactNode;
}) {
  const scored = player.scores[category];
  const open = scored === undefined;
  const points = open && preview ? scoreFor(category, dice, player) : null;
  const glow = useFlash(flash);
  // The number springs up as it lands in its box.
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!flash) return;
    pop.setValue(1.6);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 150 }).start();
  }, [flash, pop]);
  const background = glow.interpolate({ inputRange: [0, 1], outputRange: ["rgba(246,211,107,0)", "rgba(246,211,107,0.42)"] });
  return (
    <Pressable
      disabled={!selectable || !open}
      onPress={() => onSelect(category)}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !selectable || !open }}
      style={({ pressed }) => [styles.row, pressed && selectable && open ? styles.rowPressed : null]}
    >
      <Animated.View style={[styles.rowGlow, { backgroundColor: background }]} pointerEvents="none" />
      <View style={styles.rowLabel}>{children}</View>
      <Animated.View
        style={[
          styles.cell,
          open ? styles.cellOpen : styles.cellDone,
          points != null ? styles.cellPreview : null,
          suggested && !selected ? styles.cellSuggested : null,
          selected ? styles.cellSelected : null,
          { transform: [{ scale: pop }] },
        ]}
      >
        <Text
          style={[
            styles.cellText,
            open ? styles.cellTextOpen : null,
            points != null ? (points > 0 ? styles.cellTextPreview : styles.cellTextZero) : null,
            !open && scored === 0 ? styles.cellTextZero : null,
            selected ? styles.cellTextSelected : null,
          ]}
        >
          {open ? (points == null ? "" : String(points)) : String(scored)}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** The card's total, which swells when points are added to it. */
function TotalValue({ value }: { value: number }) {
  const [bump] = useState(() => new Animated.Value(1));
  const last = useRef(value);
  useEffect(() => {
    if (value > last.current) {
      bump.setValue(1.45);
      Animated.spring(bump, { toValue: 1, useNativeDriver: true, friction: 4, tension: 140 }).start();
    }
    last.current = value;
  }, [value, bump]);
  return <Animated.Text style={[styles.totalValue, { transform: [{ scale: bump }] }]}>{value}</Animated.Text>;
}

/**
 * One player's card: the upper boxes on the left with the bonus meter, the lower boxes on the right.
 * While `preview` is on, every open box shows what the dice on the table would score there.
 */
export function Scorecard({
  player,
  dice,
  preview,
  selectable,
  selected,
  flashCategory,
  onSelect,
}: {
  player: DicePlayer;
  dice: number[];
  preview: boolean;
  selectable: boolean;
  selected: Category | null;
  flashCategory: Category | null;
  onSelect: (category: Category) => void;
}) {
  const upper = upperTotal(player);
  const bonusEarned = upper >= UPPER_BONUS_AT;
  const suggestion = preview && selectable ? bestBox(player, dice) : null;
  const shared = { player, dice, preview, selectable, onSelect };
  return (
    <View style={styles.card}>
      <View style={styles.columns}>
        <View style={styles.upper}>
          {UPPER.map((category, index) => (
            <Box
              key={category}
              category={category}
              selected={selected === category}
              suggested={suggestion === category}
              flash={flashCategory === category}
              {...shared}
            >
              <DieFace face={index + 1} size={20} />
              <Text style={styles.upperLabel} numberOfLines={1}>{t(UPPER_LABEL[category])}</Text>
            </Box>
          ))}
          <View style={styles.bonus}>
            <View style={styles.bonusTop}>
              <Text style={styles.bonusLabel}>{t("dcBonus")}</Text>
              <Text style={[styles.bonusValue, bonusEarned ? styles.bonusValueOn : null]}>
                {bonusEarned ? `+${UPPER_BONUS}` : `${upper}/${UPPER_BONUS_AT}`}
              </Text>
            </View>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${Math.min(100, (upper / UPPER_BONUS_AT) * 100)}%` }, bonusEarned ? styles.meterFull : null]} />
            </View>
          </View>
        </View>
        <View style={styles.lower}>
          {LOWER.map((category) => (
            <Box
              key={category}
              category={category}
              selected={selected === category}
              suggested={suggestion === category}
              flash={flashCategory === category}
              {...shared}
            >
              <Text style={[styles.lowerLabel, category === "fiveKind" ? styles.fiveLabel : null]} numberOfLines={1}>
                {t(LABEL[category])}
              </Text>
            </Box>
          ))}
          {player.fiveKindBonus > 0 ? (
            <View style={styles.extraFive}>
              <Text style={styles.extraFiveText}>{t("dcFiveBonus", { n: player.fiveKindBonus * 100 })}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t("dcTotal")}</Text>
        <TotalValue key={player.id} value={totalOf(player)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 8,
    backgroundColor: "rgba(20, 23, 42, 0.86)",
    backgroundImage: "linear-gradient(180deg, rgba(36,40,72,0.95) 0%, rgba(18,20,38,0.95) 100%)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.16)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
    gap: 6,
  },
  columns: { flexDirection: "row", gap: 10 },
  upper: { flex: 0.86, gap: 2 },
  lower: { flex: 1.14, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", height: 28, borderRadius: 10, paddingHorizontal: 4, gap: 6 },
  rowPressed: { backgroundColor: "rgba(246,211,107,0.12)" },
  rowGlow: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10 },
  rowLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  upperLabel: { color: "#a6a8c8", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  lowerLabel: { color: "#dfe2ff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  fiveLabel: { color: "#f6d36b", fontWeight: "900" },
  cell: { minWidth: 40, height: 23, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cellOpen: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(200,206,255,0.22)" },
  cellDone: { backgroundColor: "rgba(200,206,255,0.10)" },
  cellPreview: { borderStyle: "solid", borderColor: "rgba(246,211,107,0.35)", backgroundColor: "rgba(246,211,107,0.06)" },
  cellSuggested: { borderColor: "rgba(246,211,107,0.85)", boxShadow: "0 0 10px rgba(246,211,107,0.35)" },
  cellSelected: { backgroundColor: "#f6d36b", borderColor: "#f6d36b", borderStyle: "solid" },
  cellText: { color: "#f7f7fc", fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  cellTextOpen: { color: "transparent" },
  cellTextPreview: { color: "#f6d36b" },
  cellTextZero: { color: "rgba(200,206,255,0.38)" },
  cellTextSelected: { color: "#1c1917" },
  bonus: { marginTop: 4, paddingHorizontal: 4, gap: 4 },
  bonusTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  bonusLabel: { color: "#a6a8c8", fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  bonusValue: { color: "#c8ceff", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  bonusValueOn: { color: "#86e3c4" },
  meter: { height: 5, borderRadius: 3, backgroundColor: "rgba(200,206,255,0.12)", overflow: "hidden" },
  meterFill: { height: 5, borderRadius: 3, backgroundColor: "#c8ceff" },
  meterFull: { backgroundColor: "#86e3c4" },
  extraFive: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(246,211,107,0.16)" },
  extraFiveText: { color: "#f6d36b", fontSize: 11, fontWeight: "900" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(200,206,255,0.12)",
  },
  totalLabel: { color: "#c8ceff", fontSize: 13, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  totalValue: { color: "#f7f7fc", fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
