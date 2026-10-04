import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameSession } from "@/game/GameSession";
import { isRtl, t } from "@/i18n";

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useGameSession();
  const params = useLocalSearchParams<{ game?: string; password?: string }>();
  const game = typeof params.game === "string" ? params.game : "";
  const password = typeof params.password === "string" ? params.password : "";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(game && password ? null : t("inviteMissing"));
  const [busy, setBusy] = useState(false);
  const align = isRtl() ? "right" : "left";

  useEffect(() => {
    if (session.ready && session.credentials) router.replace("/table");
  }, [router, session.credentials, session.ready]);

  async function sit() {
    if (session.credentials) {
      router.replace("/table");
      return;
    }
    if (!game || !password) return;
    setError(null);
    setBusy(true);
    try {
      await session.join(name.trim(), game, password);
      router.replace("/table");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("couldNotJoin"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />
      <Text style={styles.mark}>{t("invited")}</Text>
      <Text style={styles.tag}>{t("takeASeat")}</Text>
      <View style={styles.felt}>
        <Text style={[styles.label, { textAlign: align }]}>{t("yourName")}</Text>
        <TextInput
          style={[styles.input, { textAlign: align }]}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder={t("enterYourName")}
          placeholderTextColor="#78716c"
        />
        <Pressable style={[styles.deal, (busy || !game) && styles.dealBusy]} disabled={busy || name.trim().length === 0 || !game} onPress={sit}>
          <Text style={styles.dealText}>{busy ? t("sittingDown") : t("sitDown")}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", paddingHorizontal: 20 },
  mark: { color: "#f6d36b", fontSize: 28, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  tag: { color: "#d6d3d1", textAlign: "center", marginTop: 8, marginBottom: 22, fontSize: 15 },
  felt: {
    backgroundColor: "#14532d",
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#7c4a1e",
    padding: 18,
    gap: 8,
  },
  label: { color: "#f6d36b", fontWeight: "800" },
  input: {
    backgroundColor: "#052e16",
    color: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#166534",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  deal: { marginTop: 8, backgroundColor: "#f6d36b", borderRadius: 24, paddingVertical: 14, alignItems: "center" },
  dealBusy: { opacity: 0.7 },
  dealText: { color: "#1c1917", fontWeight: "900", fontSize: 18 },
  error: { color: "#fecaca", marginTop: 4 },
});
