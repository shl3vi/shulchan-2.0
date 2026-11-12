import { useState, useSyncExternalStore } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { storeUrl, subscribeRemoteConfig, remoteConfig, type RemoteConfig } from "@/game/remoteConfig";
import { t } from "@/i18n";

function useRemoteSnapshot(): RemoteConfig {
  return useSyncExternalStore(subscribeRemoteConfig, remoteConfig, remoteConfig);
}

export function useRemoteConfig() {
  return useRemoteSnapshot();
}

export function UpdateNotice({ mode }: { mode: "ask" | "force" }) {
  useRemoteSnapshot();
  const [later, setLater] = useState(false);
  if (mode === "ask" && later) return null;
  const url = storeUrl();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t(mode === "force" ? "updateForceTitle" : "updateTitle")}</Text>
      <Text style={styles.body}>{t(mode === "force" ? "updateForceBody" : "updateBody")}</Text>
      {url ? (
        <Pressable style={styles.button} onPress={() => void Linking.openURL(url)} accessibilityRole="button">
          <Text style={styles.buttonText}>{t("updateOpen")}</Text>
        </Pressable>
      ) : null}
      {mode === "ask" ? (
        <Pressable onPress={() => setLater(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.later}>{t("updateLater")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(20, 23, 42, 0.92)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.18)",
    padding: 18,
    gap: 8,
    marginBottom: 16,
  },
  title: { color: "#f7f7fc", fontSize: 18, fontWeight: "900" },
  body: { color: "#c7c9d9", fontSize: 15, lineHeight: 21 },
  button: {
    marginTop: 6,
    backgroundColor: "#f3a66f",
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#2a130a", fontWeight: "900", fontSize: 16 },
  later: { color: "#a8b2ff", fontWeight: "800", textAlign: "center", paddingVertical: 6 },
});
