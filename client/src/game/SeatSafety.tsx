import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { blockPlayer, reportPlayer } from "@/game/api";
import type { Credentials } from "@/game/types";
import { supportMail } from "@/game/support";
import { t } from "@/i18n";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

type Reason = "name" | "camera" | "microphone";

export function SeatSafety({
  credentials,
  targetId,
  targetName,
  blocked,
  onClose,
}: {
  credentials: Credentials;
  targetId: string;
  targetName: string;
  blocked: boolean;
  onClose: () => void;
}) {
  const [reasons, setReasons] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function report(reason: Reason) {
    if (busy) return;
    setBusy(true);
    try {
      await reportPlayer(credentials.gameId, credentials.playerId, credentials.playerSecret, targetId, reason);
      setReasons(false);
      setSent(true);
      void Linking.openURL(supportMail(credentials.gameId, targetName, reason));
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : t("reportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (busy) return;
    setBusy(true);
    try {
      await blockPlayer(credentials.gameId, credentials.playerId, credentials.playerSecret, targetId, !blocked);
      onClose();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : t("blockFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {reasons ? (
        <>
          <Pressable style={styles.row} disabled={busy} onPress={() => void report("name")}>
            <Text style={styles.label}>{t("reportName")}</Text>
          </Pressable>
          <Pressable style={styles.row} disabled={busy} onPress={() => void report("camera")}>
            <Text style={styles.label}>{t("reportCamera")}</Text>
          </Pressable>
          <Pressable style={styles.row} disabled={busy} onPress={() => void report("microphone")}>
            <Text style={styles.label}>{t("reportMic")}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.row} onPress={() => setReasons(true)}>
          <Text style={styles.label}>{t("reportSeat")}</Text>
        </Pressable>
      )}
      <Pressable style={styles.row} disabled={busy} onPress={() => void toggleBlock()}>
        <Text style={styles.label}>{blocked ? t("unblockSeat") : t("blockSeat")}</Text>
      </Pressable>
      <ConfirmDialog
        visible={sent}
        title={t("reportSent")}
        message={t("reportSentBody")}
        dismissLabel={t("cancel")}
        onDismiss={() => {
          setSent(false);
          onClose();
        }}
      />
      <ConfirmDialog
        visible={failed != null}
        title={t("reportSeat")}
        message={failed ?? ""}
        dismissLabel={t("cancel")}
        onDismiss={() => setFailed(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 6,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(168, 178, 255, 0.12)",
  },
  label: { color: "#f7f7fc", fontWeight: "700" },
});
