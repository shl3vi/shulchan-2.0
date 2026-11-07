import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteHostAccount } from "@/game/api";
import { loadHost, saveHost, type Host } from "@/game/hostStore";
import { isRtl, t } from "@/i18n";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRtl() ? "right" : "left";
  const [host, setHost] = useState<Host | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    void loadHost().then(setHost);
  }, []));

  async function confirmDeleteAccount() {
    if (!host) return;
    const token = host.token;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await deleteHostAccount(token);
      setHost(null);
      await saveHost(null);
      router.back();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : t("deleteAccountFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />
      <View style={[styles.header, isRtl() && styles.headerRtl]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("cancel")}>
          <Ionicons name={isRtl() ? "chevron-forward" : "chevron-back"} size={26} color="#f7f7fc" />
        </Pressable>
        <Text style={styles.title}>{t("account")}</Text>
      </View>
      <View style={styles.card}>
        <Text style={[styles.email, { textAlign: align }]}>{host?.email ?? t("noAccountConnected")}</Text>
        {!host ? <Text style={[styles.hint, { textAlign: align }]}>{t("signInToManageAccount")}</Text> : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.delete, (!host || busy) && styles.deleteDisabled, pressed && host && styles.pressed]}
        disabled={!host || busy}
        onPress={() => setConfirmDelete(true)}
      >
        <Ionicons name="trash-outline" size={19} color={host ? "#ffaaa2" : "#686a79"} />
        <Text style={[styles.deleteText, !host && styles.deleteTextDisabled]}>{t("deleteAccount")}</Text>
      </Pressable>
      <ConfirmDialog
        visible={confirmDelete}
        title={t("deleteAccount")}
        message={t("deleteAccountSure")}
        dismissLabel={t("cancel")}
        onDismiss={() => setConfirmDelete(false)}
        confirmLabel={t("deleteAccountYes")}
        confirmTone="danger"
        onConfirm={() => void confirmDeleteAccount()}
      />
      <ConfirmDialog
        visible={notice != null}
        title={t("deleteAccount")}
        message={notice ?? ""}
        dismissLabel={t("cancel")}
        onDismiss={() => setNotice(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b16", paddingHorizontal: 22 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 22 },
  headerRtl: { flexDirection: "row-reverse" },
  title: { color: "#f7f7fc", fontSize: 22, fontWeight: "900" },
  card: {
    borderRadius: 20,
    backgroundColor: "rgba(20, 23, 42, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.16)",
    padding: 16,
    gap: 6,
  },
  email: { color: "#f7f7fc", fontSize: 16, fontWeight: "800" },
  hint: { color: "#8f91a3", fontSize: 14, lineHeight: 20 },
  delete: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 170, 162, 0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteDisabled: { opacity: 0.55 },
  deleteText: { color: "#ffaaa2", fontSize: 16, fontWeight: "800" },
  deleteTextDisabled: { color: "#686a79" },
  pressed: { opacity: 0.7 },
});
