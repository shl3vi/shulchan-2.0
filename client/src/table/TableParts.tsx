import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdBanner } from "@/ads/AdBanner";
import { API_URL } from "@/game/api";
import { GetTheApp } from "@/game/GetTheApp";
import { t, type MessageKey } from "@/i18n";
import { tableStyles } from "@/table/tableStyles";
import { codeText } from "@/game/errors";

function WinnerSparkles() {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View pointerEvents="none" style={[styles.sparkOrbit, { transform: [{ rotate }] }]}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <Text
            key={index}
            style={[
              styles.spark,
              { left: 72 + Math.cos(angle) * 64, top: 72 + Math.sin(angle) * 64 },
            ]}
          >
            ✦
          </Text>
        );
      })}
    </Animated.View>
  );
}

/** A seated player: their video, or their initial, in a ring that lights when it is their move. */
export function PlayerCircle({
  name,
  video,
  nameAbove,
  celebrate,
  attention,
}: {
  name: string;
  video?: ReactNode;
  nameAbove?: boolean;
  celebrate?: boolean;
  attention?: "roll" | "play" | null;
}) {
  const shown = name || t("openSeat");
  const label = (
    <Text style={styles.playerName} numberOfLines={1}>
      {shown}
    </Text>
  );
  const initial = name ? name.replace(/\D/g, "").slice(0, 1) || name.slice(0, 1) : "+";
  const circle = (
    <View style={[styles.circle, attention ? styles.circleLit : null]}>
      {video ?? <Text style={styles.initial}>{initial}</Text>}
    </View>
  );
  return (
    <View style={styles.player}>
      {nameAbove ? label : null}
      <View style={styles.circleWrap}>
        {celebrate ? <WinnerSparkles /> : null}
        {circle}
      </View>
      {nameAbove ? null : label}
    </View>
  );
}

export function VideoNotice({ message, onClose }: { message: MessageKey; onClose?: () => void }) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{t(message)}</Text>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color="#fecaca" />
      </Pressable>
    </View>
  );
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <View>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.infoValue} selectable>
          {value}
        </Text>
        <Pressable onPress={() => void copy()} hitSlop={8} accessibilityLabel={copied ? t("copied") : t("copy")}>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={22} color="#a8b2ff" />
        </Pressable>
      </View>
    </View>
  );
}

/** Shares the table's join link, with its password when this player can see it. */
export function shareTable(gameId: string, password?: string) {
  const link = `${API_URL}/join?${new URLSearchParams({ game: gameId, ...(password ? { password } : {}) })}`;
  Share.share({ message: t("shareMessage", { link }) });
}

/** Refusals every table can show, in the player's language, by the server's code. Anything else is shown as sent. */
/**
 * What the error banner says. A server error is translated by its code, the game's own codes first;
 * one without a code is a message the app wrote itself, already in the player's language.
 */
export function tableError(message: string, code: string | null, game?: Record<string, MessageKey>) {
  return code ? codeText(code, game) : message;
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color="#fecaca" />
      </Pressable>
    </View>
  );
}

/** Back to the lobby, top left. The seat is kept. */
export function HomeButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.dismissTo("/")} hitSlop={8}>
      <Ionicons name="home" size={20} color="#c8ceff" />
    </Pressable>
  );
}

/** The ad slot and the get-the-app strip under every table. */
export function TableFooter({ showAd }: { showAd: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingBottom: insets.bottom, backgroundColor: "#090b16" }}>
      {showAd ? <View style={styles.ad}><AdBanner /></View> : null}
      <GetTheApp variant="strip" />
    </View>
  );
}

const styles = {
  ...tableStyles,
  ...StyleSheet.create({
    player: { alignItems: "center", gap: 8, maxWidth: 160 },
    circleWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center" },
    sparkOrbit: { position: "absolute", width: 160, height: 160, left: -34, top: -34 },
    spark: { position: "absolute", color: "#f6d36b", fontSize: 16, fontWeight: "900" },
    // Whose move it is: a soft mint ring with a glow, not a hard outline.
    circleLit: { borderWidth: 3, borderColor: "#86e3c4", boxShadow: "0 0 16px rgba(134,227,196,0.5), 0 8px 16px rgba(0,0,0,0.5)" },
    circle: {
      width: 92,
      height: 92,
      borderRadius: 46,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "rgba(246,211,107,0.75)",
      backgroundColor: "#1c1917",
      backgroundImage: "linear-gradient(180deg, #2c2724 0%, #1c1917 55%, #121010 100%)",
      boxShadow: "0 2px 2px rgba(0,0,0,0.5), 0 8px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    initial: { color: "#fafaf9", fontSize: 40, fontWeight: "800" },
    playerName: { color: "#fafaf9", fontSize: 16, fontWeight: "800" },
  }),
};
