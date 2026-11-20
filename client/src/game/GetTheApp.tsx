import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { isWeb } from "@/game/api";
import { webStoreUrl } from "@/game/remoteConfig";
import { useRemoteConfig } from "@/game/UpdateNotice";
import { isRtl, t } from "@/i18n";

const DISMISSED = "shulchan.getTheApp.dismissed";

function wasDismissed() {
  try {
    return globalThis.sessionStorage?.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    globalThis.sessionStorage?.setItem(DISMISSED, "1");
  } catch {
    // Closed for this page only.
  }
}

/**
 * Browser only: asks a guest to get the app, with a link to the store for their phone.
 * `card` sits on the join screen. `strip` sits under the table and can be closed for the visit.
 */
export function GetTheApp({ variant }: { variant: "card" | "strip" }) {
  useRemoteConfig();
  const [closed, setClosed] = useState(wasDismissed);
  const url = isWeb ? webStoreUrl() : "";
  if (!isWeb || !url || (variant === "strip" && closed)) return null;
  const align = isRtl() ? "right" : "left";

  const open = () => {
    void Linking.openURL(url).catch(() => undefined);
  };

  if (variant === "strip") {
    return (
      <View style={[styles.strip, isRtl() && styles.reverse]}>
        <Ionicons name="phone-portrait-outline" size={18} color="#f6d36b" />
        <Text style={[styles.stripText, { textAlign: align }]} numberOfLines={2}>{t("getAppTitle")}</Text>
        <Pressable style={styles.stripButton} onPress={open} hitSlop={6}>
          <Text style={styles.buttonText}>{t("getApp")}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            rememberDismissed();
            setClosed(true);
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Ionicons name="close" size={18} color="#a8a29e" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: align }]}>{t("getAppTitle")}</Text>
      <Text style={[styles.body, { textAlign: align }]}>{t("getAppBody")}</Text>
      <Pressable style={styles.cardButton} onPress={open}>
        <Ionicons name="download-outline" size={18} color="#1c1917" />
        <Text style={styles.buttonText}>{t("getApp")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: "rgba(246, 211, 107, 0.08)",
    borderColor: "rgba(246, 211, 107, 0.45)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 6,
  },
  title: { color: "#f6d36b", fontWeight: "900", fontSize: 16 },
  body: { color: "#d6d3d1", fontSize: 14, lineHeight: 20 },
  cardButton: {
    marginTop: 6,
    flexDirection: "row",
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f6d36b",
    borderRadius: 999,
    paddingVertical: 11,
  },
  buttonText: { color: "#1c1917", fontWeight: "900", fontSize: 14 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#14172a",
    borderTopWidth: 1,
    borderTopColor: "rgba(246, 211, 107, 0.3)",
  },
  reverse: { flexDirection: "row-reverse" },
  stripText: { flex: 1, color: "#f7f7fc", fontWeight: "700", fontSize: 13 },
  stripButton: { backgroundColor: "#f6d36b", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, flexShrink: 0 },
});
