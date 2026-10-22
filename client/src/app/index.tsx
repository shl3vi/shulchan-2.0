import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL, redeemHostCode } from "@/game/api";
import { useGameSession } from "@/game/GameSession";
import { loadHost, saveHost, type Host } from "@/game/hostStore";
import { playerName } from "@/game/name";
import { useKeyboardInset } from "@/game/useKeyboardInset";
import { isRtl, t } from "@/i18n";

WebBrowser.maybeCompleteAuthSession();

const BLINDS = [1, 2, 5, 10];
const BUY_INS = [50, 100, 200, 500];

function ChipRow({
  values,
  selected,
  minimum,
  onSelect,
  onValidity,
}: {
  values: number[];
  selected: number;
  minimum: number;
  onSelect: (value: number) => void;
  onValidity: (valid: boolean) => void;
}) {
  const preset = values.includes(selected);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(preset ? "" : String(selected));
  const [invalid, setInvalid] = useState(false);

  function commit(text: string) {
    const value = Number(text);
    const valid = Number.isInteger(value) && value >= minimum;
    setInvalid(!valid);
    onValidity(valid);
    if (valid) onSelect(value);
  }

  return (
    <View style={styles.customWrap}>
      <View style={styles.chips}>
        {values.map((value) => (
          <Pressable
            key={value}
            style={[styles.chip, selected === value && !custom && styles.chipOn]}
            onPress={() => {
              setCustom(false);
              setInvalid(false);
              onValidity(true);
              onSelect(value);
            }}
          >
            <Text style={[styles.chipText, selected === value && !custom && styles.chipTextOn]}>{value}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, (custom || !preset) && styles.chipOn]}
          onPress={() => {
            setCustom(true);
            if (!preset) setDraft(String(selected));
          }}
        >
          <Ionicons name="add" size={18} color={custom || !preset ? "#1c1917" : "#d6d3d1"} />
        </Pressable>
      </View>
      {custom ? (
        <TextInput
          style={[styles.input, { textAlign: isRtl() ? "right" : "left" }]}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            const value = Number(text);
            if (Number.isInteger(value) && value >= minimum) {
              setInvalid(false);
              onValidity(true);
              onSelect(value);
            } else onValidity(false);
          }}
          onBlur={() => commit(draft)}
          keyboardType="number-pad"
          placeholder={minimum > 1 ? t("moreThan", { n: minimum - 1 }) : t("yourAmount")}
          placeholderTextColor="#78716c"
          autoFocus
        />
      ) : null}
      {invalid ? <Text style={styles.error}>{t("wholeNumber", { n: minimum })}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useGameSession();
  const keyboard = useKeyboardInset();
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (keyboard > 0) scroll.current?.scrollToEnd({ animated: true });
  }, [keyboard]);
  const seated = session.credentials != null;
  const align = isRtl() ? "right" : "left";
  const [name, setName] = useState("");
  const [smallBlind, setSmallBlind] = useState(1);
  const [buyIn, setBuyIn] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blindOk, setBlindOk] = useState(true);
  const [buyInOk, setBuyInOk] = useState(true);
  const [nameMissing, setNameMissing] = useState(false);
  const [host, setHost] = useState<Host | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"poker" | "backgammon" | null>(null);
  const nameInput = useRef<TextInput>(null);

  const refreshHost = useCallback(() => {
    void loadHost().then(setHost);
  }, []);
  useFocusEffect(refreshHost);

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      const back = Linking.createURL("auth");
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_URL}/auth/google?return=${encodeURIComponent(back)}`,
        back,
      );
      if (result.type !== "success") return;
      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (!code) throw new Error(t("serverUnreachable"));
      const next = await redeemHostCode(code).catch(async (cause: unknown) => {
        const saved = await loadHost();
        if (saved) return saved;
        throw cause;
      });
      setHost(next);
      await saveHost(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("serverUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setHost(null);
    setCreating(false);
    setKind(null);
    setError(null);
    await saveHost(null);
  }

  function openCreate() {
    setCreating((open) => {
      if (open) setKind(null);
      return !open;
    });
  }

  async function create(nextKind: "poker" | "backgammon" = "poker") {
    const seatedName = playerName(name);
    if (!seatedName) {
      setNameMissing(true);
      setError(t("nameLength"));
      scroll.current?.scrollTo({ y: 0, animated: true });
      nameInput.current?.focus();
      return;
    }
    setNameMissing(false);
    setError(null);
    setBusy(true);
    try {
      if (!host) return;
      await session.createAndSit(seatedName, smallBlind, buyIn, host.token, nextKind);
      router.push(nextKind === "backgammon" ? { pathname: "/table", params: { kind: "backgammon" } } : "/table");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("serverUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 + keyboard }}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="light" />
      <Text style={styles.mark}>SHULCHAN</Text>
      <Text style={styles.tag}>{t("tagline")}</Text>
      {host ? (
        <View style={styles.helloRow}>
          <Text style={styles.hello}>{t("hello", { name: host.email.split("@")[0] ?? host.email })}</Text>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.logout}>{t("logout")}</Text>
          </Pressable>
        </View>
      ) : null}
      {seated ? (
        <Pressable style={styles.return} onPress={() => router.push("/table")}>
          <Text style={styles.returnTitle}>{t("atTable")}</Text>
          <Text style={styles.returnText}>{t("backToSeat")}</Text>
        </Pressable>
      ) : null}
      <Pressable style={[styles.joinCode, styles.createButton]} disabled={busy || seated} onPress={openCreate}>
        <Ionicons name="add-circle-outline" size={20} color="#f6d36b" />
        <Text style={styles.joinCodeText}>{t("createTable")}</Text>
      </Pressable>
      {creating && !host ? (
        <View style={styles.signIn}>
          <Text style={[styles.signInHint, { textAlign: align }]}>{t("signInToCreate")}</Text>
          <Pressable
            style={[styles.google, isRtl() && styles.googleRtl, busy && styles.googleBusy]}
            disabled={busy}
            onPress={signIn}
            accessibilityRole="button"
          >
            <Image source={require("../../assets/images/google-g.png")} style={styles.googleG} contentFit="contain" />
            <Text style={styles.googleText}>{t("signInGoogle")}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
      {creating && host && kind == null ? (
        <View style={[styles.kindGrid, isRtl() && styles.kindGridRtl]}>
          <Pressable
            style={styles.kindCard}
            onPress={() => setKind("backgammon")}
          >
            <Text style={styles.kindTitle}>{t("backgammonTable")}</Text>
          </Pressable>
          <Pressable style={styles.kindCard} onPress={() => setKind("poker")}>
            <Text style={styles.kindTitle}>{t("pokerTable")}</Text>
          </Pressable>
        </View>
      ) : null}
      {creating && host && (kind === "poker" || kind === "backgammon") ? (
        <View style={[styles.felt, seated && styles.feltOff]}>
          <Text style={[styles.label, { textAlign: align }]}>{t("yourName")}</Text>
          <TextInput
            ref={nameInput}
            style={[styles.input, { textAlign: align }, nameMissing && styles.inputMissing]}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim().length > 0) setNameMissing(false);
            }}
            autoCapitalize="words"
            placeholder={t("enterYourName")}
            placeholderTextColor="#78716c"
            maxLength={24}
          />
          {kind === "poker" ? (
            <>
          <Text style={[styles.label, { textAlign: align }]}>{t("smallBlind")}</Text>
          <ChipRow values={BLINDS} selected={smallBlind} minimum={1} onSelect={setSmallBlind} onValidity={setBlindOk} />
          <Text style={[styles.label, { textAlign: align }]}>{t("buyIn")}</Text>
          <ChipRow values={BUY_INS} selected={buyIn} minimum={11} onSelect={setBuyIn} onValidity={setBuyInOk} />
            </>
          ) : null}
          <Pressable
            style={[styles.deal, (busy || seated || (kind === "poker" && (!blindOk || !buyInOk))) && styles.dealBusy]}
            disabled={busy || seated || (kind === "poker" && (!blindOk || !buyInOk))}
            onPress={() => void create(kind === "backgammon" ? "backgammon" : "poker")}
          >
            <Text style={styles.dealText}>{busy ? t("shuffling") : t("dealMeIn")}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
      {error && !creating ? <Text style={styles.error}>{error}</Text> : null}
      {seated ? null : (
        <Pressable style={styles.joinCode} onPress={() => router.push("/join")}>
          <Ionicons name="enter-outline" size={20} color="#f6d36b" />
          <Text style={styles.joinCodeText}>{t("joinWithId")}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", paddingHorizontal: 20 },
  mark: { color: "#f6d36b", fontSize: 36, fontWeight: "900", letterSpacing: 4, textAlign: "center" },
  tag: { color: "#d6d3d1", textAlign: "center", marginTop: 8, marginBottom: 22, fontSize: 15 },
  helloRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 },
  hello: { color: "#fafaf9", fontSize: 20, fontWeight: "800", flex: 1 },
  logout: { color: "#f6d36b", fontWeight: "800", fontSize: 16 },
  return: { backgroundColor: "#f6d36b", borderRadius: 18, padding: 16, marginBottom: 16 },
  returnTitle: { color: "#1c1917", fontWeight: "900", fontSize: 18 },
  returnText: { color: "#44403c", marginTop: 4 },
  felt: {
    backgroundColor: "#14532d",
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#7c4a1e",
    padding: 18,
    gap: 8,
    marginTop: 12,
  },
  feltOff: { opacity: 0.45 },
  label: { color: "#f6d36b", fontWeight: "800", letterSpacing: 0.6, marginTop: 6 },
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
  inputMissing: { borderColor: "#f87171", borderWidth: 2 },
  customWrap: { gap: 8 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    backgroundColor: "#052e16",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#166534",
    paddingVertical: 10,
    alignItems: "center",
  },
  chipOn: { backgroundColor: "#f6d36b", borderColor: "#f6d36b" },
  chipText: { color: "#d6d3d1", fontWeight: "800" },
  chipTextOn: { color: "#1c1917" },
  deal: { marginTop: 12, backgroundColor: "#f6d36b", borderRadius: 24, paddingVertical: 14, alignItems: "center" },
  dealBusy: { opacity: 0.7 },
  dealText: { color: "#1c1917", fontWeight: "900", fontSize: 18, letterSpacing: 0.4 },
  signIn: {
    backgroundColor: "#000000",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 18,
    gap: 8,
    marginTop: 12,
  },
  google: {
    marginTop: 8,
    minHeight: 40,
    backgroundColor: "#131314",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#8E918F",
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleRtl: { flexDirection: "row-reverse" },
  googleBusy: { opacity: 0.7 },
  googleG: { width: 20, height: 20 },
  googleText: { color: "#E3E3E3", fontWeight: "500", fontSize: 14 },
  signInHint: { color: "#E3E3E3", fontSize: 15, marginBottom: 4 },
  error: { color: "#fecaca", marginTop: 8 },
  createButton: { marginTop: 0 },
  kindGrid: { flexDirection: "row", gap: 12, marginTop: 12 },
  kindGridRtl: { flexDirection: "row-reverse" },
  kindCard: {
    flex: 1,
    minHeight: 120,
    backgroundColor: "#14532d",
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#7c4a1e",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  kindTitle: { color: "#f6d36b", fontWeight: "900", fontSize: 18, textAlign: "center" },
  joinCode: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#f6d36b",
    paddingVertical: 13,
  },
  joinCodeText: { color: "#f6d36b", fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
});
