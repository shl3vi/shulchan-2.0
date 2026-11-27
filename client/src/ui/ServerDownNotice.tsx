import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { useGameSession } from "@/game/GameSession";
import { isRtl, t } from "@/i18n";

/**
 * Covers the whole app while a seated player's connection to the table is down. Nothing behind it can be
 * tapped, and the back button does nothing, so no action is taken until the server answers again.
 * It goes away by itself on reconnect, when the table sends its state again.
 */
export function ServerDownNotice() {
  const { serverDown, credentials } = useGameSession();
  const visible = serverDown && credentials != null;
  const align = { textAlign: isRtl() ? "right" : "left" } as const;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <View style={[styles.head, isRtl() && styles.headRtl]}>
            <ActivityIndicator color="#f3a66f" />
            <Text style={[styles.title, align]}>{t("serverDownTitle")}</Text>
          </View>
          <Text style={[styles.message, align]}>{t("serverDownBody")}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 4, 12, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#14172a",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.2)",
    padding: 20,
    gap: 12,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headRtl: { flexDirection: "row-reverse" },
  title: { flex: 1, color: "#f7f7fc", fontSize: 20, fontWeight: "900" },
  message: { color: "#a6a8b8", fontSize: 15, lineHeight: 21 },
});
