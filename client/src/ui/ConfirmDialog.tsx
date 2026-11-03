import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { isRtl } from "@/i18n";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
  confirmLabel?: string;
  confirmTone?: "primary" | "danger";
  onConfirm?: () => void;
};

/** Centered yes/no (or dismiss-only) prompt. Use this instead of the system alert. */
export function ConfirmDialog({
  visible,
  title,
  message,
  dismissLabel,
  onDismiss,
  confirmLabel,
  confirmTone = "primary",
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={[styles.title, { textAlign: isRtl() ? "right" : "left" }]}>{title}</Text>
          <Text style={[styles.message, { textAlign: isRtl() ? "right" : "left" }]}>{message}</Text>
          <View style={[styles.actions, isRtl() && styles.actionsRtl]}>
            <Pressable
              style={({ pressed }) => [styles.button, styles.dismiss, pressed && styles.pressed]}
              onPress={onDismiss}
              accessibilityRole="button"
            >
              <Text style={styles.dismissText}>{dismissLabel}</Text>
            </Pressable>
            {confirmLabel && onConfirm ? (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  confirmTone === "danger" ? styles.danger : styles.primary,
                  pressed && styles.pressed,
                ]}
                onPress={onConfirm}
                accessibilityRole="button"
              >
                <Text style={confirmTone === "danger" ? styles.dangerText : styles.primaryText}>{confirmLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 4, 12, 0.68)",
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
  title: { color: "#f7f7fc", fontSize: 20, fontWeight: "900" },
  message: { color: "#a6a8b8", fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  actionsRtl: { flexDirection: "row-reverse" },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pressed: { opacity: 0.84 },
  dismiss: {
    backgroundColor: "rgba(20, 23, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.18)",
  },
  dismissText: { color: "#c8ceff", fontSize: 15, fontWeight: "800" },
  primary: { backgroundColor: "#f3a66f" },
  primaryText: { color: "#2a130a", fontSize: 15, fontWeight: "800" },
  danger: { backgroundColor: "#c4544a" },
  dangerText: { color: "#fff6f4", fontSize: 15, fontWeight: "800" },
});
