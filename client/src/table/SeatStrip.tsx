import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export type StripSeat = {
  id: string;
  /** Shown on the tile, such as the player's name or "You". */
  label: string;
  /** The name the initial comes from when there is no video. */
  initialOf: string;
  video?: ReactNode;
  /** A short value in the corner, such as a score or a tile count. */
  badge?: string;
  active?: boolean;
  /** The tile the screen is showing details for. */
  chosen?: boolean;
  winner?: boolean;
  gone?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

/**
 * How big each tile is. Up to four players share one row. Five or six take two rows of three,
 * with wider, shorter tiles, so each video stays big enough to see a face.
 */
export function stripSize(count: number, width: number, maxHeight: number) {
  const rows = count > 4 ? 2 : 1;
  const perRow = Math.ceil(Math.max(1, count) / rows);
  const gap = rows > 1 ? 6 : 8;
  const each = Math.floor((width - gap * Math.max(0, perRow - 1)) / perRow);
  const tileWidth = Math.min(120, each);
  const tileHeight = rows > 1 ? Math.round(tileWidth * 0.72) : Math.min(maxHeight, Math.round(tileWidth * 1.2));
  return { tileWidth, tileHeight, gap, rows, height: rows * tileHeight + (rows - 1) * gap };
}

/**
 * The players along the top of a table, as video tiles side by side. Whose move it is glows,
 * and the winner gets a trophy. Used by games whose tables seat more than two.
 */
export function SeatStrip({ seats, width, maxHeight }: { seats: StripSeat[]; width: number; maxHeight: number }) {
  const { tileWidth, tileHeight, gap, height } = stripSize(seats.length, width, maxHeight);
  return (
    <View style={[styles.row, { gap, height }]}>
      {seats.map((seat) => (
        <Pressable
          key={seat.id}
          onPress={seat.onPress}
          onLongPress={seat.onLongPress}
          style={[
            styles.tile,
            { width: tileWidth, height: tileHeight },
            seat.gone ? styles.gone : null,
            seat.chosen ? styles.chosen : null,
            seat.active ? styles.active : null,
            seat.winner ? styles.winner : null,
          ]}
        >
          <View style={styles.clip}>
            {seat.video ?? <Text style={[styles.initial, { fontSize: Math.round(Math.min(tileWidth, tileHeight) * 0.42) }]}>{seat.initialOf.slice(0, 1).toUpperCase() || "+"}</Text>}
          </View>
          <View style={styles.nameBand} pointerEvents="none">
            <Text style={[styles.name, tileWidth < 70 ? styles.nameSmall : null]} numberOfLines={1}>
              {seat.label}
            </Text>
          </View>
          {seat.badge != null ? (
            <View style={[styles.badge, seat.active ? styles.badgeActive : null]} pointerEvents="none">
              <Text style={[styles.badgeText, seat.active ? styles.badgeTextActive : null]}>{seat.badge}</Text>
            </View>
          ) : null}
          {seat.winner ? (
            <View style={styles.trophy} pointerEvents="none">
              <Ionicons name="trophy" size={12} color="#1c1917" />
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignContent: "center", alignSelf: "stretch" },
  tile: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(246,211,107,0.45)",
    backgroundColor: "#1c1917",
    backgroundImage: "linear-gradient(180deg, #2c2724 0%, #1c1917 55%, #121010 100%)",
    boxShadow: "0 6px 14px rgba(0,0,0,0.45)",
  },
  clip: { flex: 1, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  initial: { color: "#fafaf9", fontWeight: "800" },
  gone: { opacity: 0.4 },
  chosen: { borderColor: "#c8ceff" },
  active: { borderWidth: 3, borderColor: "#86e3c4", boxShadow: "0 0 16px rgba(134,227,196,0.55), 0 6px 14px rgba(0,0,0,0.45)" },
  winner: { borderColor: "#f6d36b", boxShadow: "0 0 18px rgba(246,211,107,0.6)" },
  nameBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 100%)",
  },
  name: { color: "#fafaf9", fontSize: 13, fontWeight: "800", textAlign: "center" },
  nameSmall: { fontSize: 11 },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 26,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "rgba(20,23,42,0.85)",
    borderWidth: 1,
    borderColor: "rgba(200,206,255,0.3)",
  },
  badgeActive: { backgroundColor: "#86e3c4", borderColor: "#86e3c4" },
  badgeText: { color: "#dfe2ff", fontSize: 12, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  badgeTextActive: { color: "#171b35" },
  trophy: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f6d36b",
    alignItems: "center",
    justifyContent: "center",
  },
});
