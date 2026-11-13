import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isRtl, t } from "@/i18n";

type Props = {
  top: number;
  paused: boolean;
  idleCloseAt?: number;
  serverNow?: number;
  isAdmin: boolean;
  onPause: (paused: boolean) => void;
};

function formatClock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function useRemaining(closeAt: number | undefined, serverNow: number | undefined) {
  const skew = useRef(0);
  const seen = useRef<number | undefined>(undefined);
  const [tick, setTick] = useState(0);
  if (serverNow != null && serverNow !== seen.current) {
    seen.current = serverNow;
    skew.current = serverNow - Date.now();
  }
  useEffect(() => {
    if (closeAt == null) return;
    const id = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(id);
  }, [closeAt]);
  return useMemo(() => {
    if (closeAt == null) return null;
    return Math.max(0, closeAt - (Date.now() + skew.current));
  }, [closeAt, serverNow, tick]);
}

/** Idle warning and admin pause. The deadline comes from the server; this only draws it. */
export function TableHold({ top, paused, idleCloseAt, serverNow, isAdmin, onPause }: Props) {
  const remaining = useRemaining(paused ? undefined : idleCloseAt, serverNow);
  if (!paused && remaining == null) return null;
  const align = isRtl() ? "right" : "left";
  return (
    <View pointerEvents="box-none" style={[styles.layer, { top }]}>
      <View style={styles.card}>
        <Text style={[styles.body, { textAlign: align }]}>{paused ? t("tablePaused") : t("idleWarning")}</Text>
        {paused || remaining == null ? null : (
          <Text style={[styles.clock, { textAlign: align }]} accessibilityLabel={t("idleClosesIn", { time: formatClock(remaining) })}>
            {t("idleClosesIn", { time: formatClock(remaining) })}
          </Text>
        )}
        {isAdmin ? (
          <Pressable style={styles.button} onPress={() => onPause(!paused)} accessibilityRole="button">
            <Text style={styles.buttonText}>{paused ? t("resumeTable") : t("pauseTable")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 12, right: 12, zIndex: 40 },
  card: {
    backgroundColor: "rgba(20, 23, 42, 0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(246, 211, 107, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  body: { color: "#f7f7fc", fontSize: 15, fontWeight: "700" },
  clock: { color: "#f6d36b", fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#f6d36b",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonText: { color: "#1c1917", fontWeight: "900" },
});
