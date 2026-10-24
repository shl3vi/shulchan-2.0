import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameSession } from "@/game/GameSession";
import { playerName } from "@/game/name";
import { isRtl, t } from "@/i18n";

// Short codes are uppercase; older tables still use lowercase UUIDs.
function normalizeCode(code: string) {
  const trimmed = code.trim();
  return trimmed.includes("-") ? trimmed : trimmed.toUpperCase();
}

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useGameSession();
  const params = useLocalSearchParams<{ game?: string; password?: string }>();
  const invite = typeof params.game === "string" && typeof params.password === "string" && params.game && params.password;
  const [game, setGame] = useState(typeof params.game === "string" ? params.game : "");
  const [password, setPassword] = useState(typeof params.password === "string" ? params.password : "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const align = isRtl() ? "right" : "left";
  const seatedName = playerName(name);
  const ready = seatedName != null && game.trim().length > 0 && password.trim().length > 0;

  useEffect(() => {
    if (session.ready && session.credentials) router.replace("/table");
  }, [router, session.credentials, session.ready]);

  async function sit() {
    if (session.credentials) {
      router.replace("/table");
      return;
    }
    if (!seatedName || !ready) {
      setError(t("nameLength"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await session.join(seatedName, normalizeCode(game), password.trim());
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
      {invite ? null : (
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
      )}
      <Text style={styles.mark}>{invite ? t("invited") : t("joinTable")}</Text>
      <Text style={styles.tag}>{invite ? t("takeASeat") : t("joinWithCode")}</Text>
      <View style={styles.felt}>
        {invite ? null : (
          <>
            <Text style={[styles.label, { textAlign: align }]}>{t("tableId")}</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={game}
              onChangeText={setGame}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="K7P2QX"
              placeholderTextColor="#78716c"
            />
            <Text style={[styles.label, { textAlign: align }]}>{t("password")}</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={password}
              onChangeText={setPassword}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor="#78716c"
            />
          </>
        )}
        <Text style={[styles.label, { textAlign: align }]}>{t("yourName")}</Text>
        <TextInput
          style={[styles.input, { textAlign: align }]}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder={t("enterYourName")}
          placeholderTextColor="#78716c"
          maxLength={24}
        />
        <Pressable style={[styles.deal, (busy || !ready) && styles.dealBusy]} disabled={busy || !ready} onPress={sit}>
          <Text style={styles.dealText}>{busy ? t("sittingDown") : t("sitDown")}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", paddingHorizontal: 20 },
  home: {
    position: "absolute",
    left: 12,
    zIndex: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(12,10,9,0.78)",
    borderWidth: 1,
    borderColor: "rgba(246,211,107,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { color: "#f6d36b", fontSize: 28, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  tag: { color: "#d6d3d1", textAlign: "center", marginTop: 8, marginBottom: 22, fontSize: 15 },
  felt: {
    backgroundColor: "#1c1917",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#44403c",
    padding: 18,
    gap: 8,
  },
  label: { color: "#f6d36b", fontWeight: "800" },
  input: {
    backgroundColor: "#0c0a09",
    color: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#44403c",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  code: { textAlign: "center", letterSpacing: 4, fontSize: 20, fontWeight: "800" },
  deal: { marginTop: 8, backgroundColor: "#f6d36b", borderRadius: 24, paddingVertical: 14, alignItems: "center" },
  dealBusy: { opacity: 0.7 },
  dealText: { color: "#1c1917", fontWeight: "900", fontSize: 18 },
  error: { color: "#fecaca", marginTop: 4 },
});
