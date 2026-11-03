import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostSession, redeemHostCode, signInUrl } from "@/game/api";
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
  const [joining, setJoining] = useState(false);
  const [kind, setKind] = useState<"poker" | "backgammon" | null>(null);
  const [autoDeal, setAutoDeal] = useState(true);
  const [joinGame, setJoinGame] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const nameInput = useRef<TextInput>(null);

  function normalizeCode(code: string) {
    const trimmed = code.trim();
    return trimmed.includes("-") ? trimmed : trimmed.toUpperCase();
  }

  const refreshHost = useCallback(() => {
    void (async () => {
      const saved = await loadHost();
      if (!saved) {
        setHost(null);
        return;
      }
      const alive = await hostSession(saved.token);
      if (alive === false) {
        setHost(null);
        setKind(null);
        await saveHost(null);
        return;
      }
      setHost(saved);
    })();
  }, []);
  useFocusEffect(refreshHost);

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      const back = Linking.createURL("auth");
      const result = await WebBrowser.openAuthSessionAsync(await signInUrl(back), back);
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
    setJoining(false);
    setCreating((open) => {
      if (open) setKind(null);
      return !open;
    });
  }

  async function sit() {
    const seatedName = playerName(joinName);
    if (!seatedName || joinGame.trim().length === 0 || joinPassword.trim().length === 0) {
      setJoinError(t("nameLength"));
      return;
    }
    setJoinError(null);
    setJoinBusy(true);
    try {
      await session.join(seatedName, normalizeCode(joinGame), joinPassword.trim());
      router.push("/table");
    } catch (cause) {
      setJoinError(cause instanceof Error ? cause.message : t("couldNotJoin"));
    } finally {
      setJoinBusy(false);
    }
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
      await session.createAndSit(seatedName, smallBlind, buyIn, host.token, nextKind, nextKind === "poker" && autoDeal);
      router.push(nextKind === "backgammon" ? { pathname: "/table", params: { kind: "backgammon" } } : "/table");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("serverUnreachable");
      if (message === "Sign in with Google to open a table") {
        setHost(null);
        setKind(null);
        setError(null);
        await saveHost(null);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.glowTop} />
        <View style={styles.glowSide} />
        <View style={styles.dotField}>
          {Array.from({ length: 12 }, (_, index) => <View key={index} style={styles.dot} />)}
        </View>
      </View>
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 28 + keyboard },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <StatusBar style="light" />
      <View style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="game-controller" size={20} color="#081b16" />
          </View>
          <Text style={styles.mark}>SHULCHAN</Text>
        </View>
        <Text style={styles.tag}>{t("tagline")}</Text>
        <View style={styles.heroArt}>
          <View style={styles.heroHalo} />
          <View style={[styles.gameTile, styles.gameTileLeft]}>
            <Ionicons name="dice" size={31} color="#f8d66d" />
          </View>
          <View style={styles.tableTop}>
            <View style={styles.tableInner}>
              <Ionicons name="diamond" size={28} color="#f8d66d" />
              <View style={styles.cardStack}>
                <View style={[styles.miniCard, styles.miniCardBack]} />
                <View style={styles.miniCard}>
                  <Ionicons name="heart" size={14} color="#ef6461" />
                </View>
              </View>
            </View>
          </View>
          <View style={[styles.gameTile, styles.gameTileRight]}>
            <Ionicons name="people" size={29} color="#f8d66d" />
          </View>
        </View>
      </View>
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
          <View style={styles.returnIcon}>
            <Ionicons name="play" size={24} color="#10231d" />
          </View>
          <View style={styles.returnCopy}>
            <Text style={styles.returnTitle}>{t("atTable")}</Text>
            <Text style={styles.returnText}>{t("backToSeat")}</Text>
          </View>
          <Ionicons name={isRtl() ? "arrow-back" : "arrow-forward"} size={22} color="#10231d" />
        </Pressable>
      ) : null}
      <Pressable
        style={[
          styles.joinCode,
          isRtl() && styles.joinCodeRtl,
          styles.createButton,
          (busy || seated) && styles.actionDisabled,
        ]}
        disabled={busy || seated}
        onPress={openCreate}
      >
        <View style={styles.actionIcon}>
          <Ionicons name="add" size={20} color="#0d211b" />
        </View>
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
            <View style={styles.kindIcon}>
              <Ionicons name="dice" size={31} color="#f8d66d" />
            </View>
            <Text style={styles.kindTitle}>{t("backgammonTable")}</Text>
          </Pressable>
          <Pressable style={styles.kindCard} onPress={() => setKind("poker")}>
            <View style={styles.kindIcon}>
              <Ionicons name="diamond" size={29} color="#f8d66d" />
            </View>
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
          <Pressable
            style={[styles.autoDeal, isRtl() && styles.autoDealRtl]}
            onPress={() => setAutoDeal((on) => !on)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: autoDeal }}
          >
            <Ionicons name={autoDeal ? "checkbox" : "square-outline"} size={22} color="#f6d36b" />
            <View style={styles.autoDealCopy}>
              <Text style={[styles.autoDealText, { textAlign: align }]}>{t("autoDeal")}</Text>
              <Text style={[styles.autoDealHint, { textAlign: align }]}>{t("autoDealHint")}</Text>
            </View>
          </Pressable>
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
        <Pressable
          style={[styles.joinCode, isRtl() && styles.joinCodeRtl]}
          onPress={() => {
            setCreating(false);
            setKind(null);
            setJoining((open) => !open);
          }}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="enter-outline" size={20} color="#0d211b" />
          </View>
          <Text style={styles.joinCodeText}>{t("joinWithId")}</Text>
        </Pressable>
      )}
      {joining && !seated ? (
        <View style={styles.felt}>
          <Text style={[styles.label, { textAlign: align }]}>{t("tableId")}</Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={joinGame}
            onChangeText={setJoinGame}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="K7P2QX"
            placeholderTextColor="#78716c"
          />
          <Text style={[styles.label, { textAlign: align }]}>{t("password")}</Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={joinPassword}
            onChangeText={setJoinPassword}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor="#78716c"
          />
          <Text style={[styles.label, { textAlign: align }]}>{t("yourName")}</Text>
          <TextInput
            style={[styles.input, { textAlign: align }]}
            value={joinName}
            onChangeText={setJoinName}
            autoCapitalize="words"
            placeholder={t("enterYourName")}
            placeholderTextColor="#78716c"
            maxLength={24}
          />
          <Pressable
            style={[styles.deal, joinBusy && styles.dealBusy]}
            disabled={joinBusy}
            onPress={() => void sit()}
          >
            <Text style={styles.dealText}>{joinBusy ? t("sittingDown") : t("sitDown")}</Text>
          </Pressable>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
        </View>
      ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#06130f" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  glowTop: {
    position: "absolute",
    width: 370,
    height: 370,
    borderRadius: 185,
    top: -235,
    left: -85,
    backgroundColor: "#174f3e",
    opacity: 0.48,
  },
  glowSide: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    top: 270,
    right: -210,
    backgroundColor: "#8f6719",
    opacity: 0.2,
  },
  dotField: {
    position: "absolute",
    top: 95,
    right: 24,
    width: 54,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    opacity: 0.25,
  },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#f8d66d" },
  hero: { alignItems: "center", marginBottom: 22 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f8d66d",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    shadowColor: "#f8d66d",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  mark: { color: "#fff2bd", fontSize: 31, fontWeight: "900", letterSpacing: 3.4, textAlign: "center" },
  tag: { color: "#b9c9c3", textAlign: "center", marginTop: 10, fontSize: 15, letterSpacing: 0.15 },
  heroArt: { width: "100%", height: 118, marginTop: 16, alignItems: "center", justifyContent: "center" },
  heroHalo: {
    position: "absolute",
    width: 210,
    height: 88,
    borderRadius: 50,
    backgroundColor: "#1d6a50",
    opacity: 0.24,
  },
  tableTop: {
    width: 176,
    height: 94,
    borderRadius: 48,
    padding: 5,
    backgroundColor: "#d0a944",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
  },
  tableInner: {
    flex: 1,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: "#39836a",
    backgroundColor: "#0c3c2e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  cardStack: { width: 38, height: 44 },
  miniCard: {
    position: "absolute",
    width: 30,
    height: 40,
    right: 0,
    bottom: 0,
    borderRadius: 6,
    backgroundColor: "#fff8dd",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "8deg" }],
  },
  miniCardBack: {
    right: 8,
    bottom: 3,
    backgroundColor: "#c74c4c",
    borderWidth: 2,
    borderColor: "#fff8dd",
    transform: [{ rotate: "-8deg" }],
  },
  gameTile: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#132a23",
    borderWidth: 1,
    borderColor: "#2b5548",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  gameTileLeft: { left: 20, bottom: 3, transform: [{ rotate: "-9deg" }] },
  gameTileRight: { right: 20, top: 3, transform: [{ rotate: "9deg" }] },
  helloRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 },
  hello: { color: "#f7f7f2", fontSize: 19, fontWeight: "800", flex: 1 },
  logout: { color: "#f6d36b", fontWeight: "800", fontSize: 16 },
  return: {
    backgroundColor: "#f8d66d",
    borderRadius: 24,
    padding: 15,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    shadowColor: "#e8ba35",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  returnIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  returnCopy: { flex: 1 },
  returnTitle: { color: "#10231d", fontWeight: "900", fontSize: 18 },
  returnText: { color: "#485149", marginTop: 3, fontSize: 14 },
  felt: {
    backgroundColor: "#10251e",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#29483d",
    padding: 18,
    gap: 8,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  feltOff: { opacity: 0.45 },
  label: { color: "#f6d36b", fontWeight: "800", letterSpacing: 0.6, marginTop: 6 },
  input: {
    backgroundColor: "#071711",
    color: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#345449",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputMissing: { borderColor: "#f87171", borderWidth: 2 },
  customWrap: { gap: 8 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    backgroundColor: "#071711",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#345449",
    paddingVertical: 10,
    alignItems: "center",
  },
  chipOn: { backgroundColor: "#f8d66d", borderColor: "#f8d66d" },
  chipText: { color: "#d6d3d1", fontWeight: "800" },
  chipTextOn: { color: "#1c1917" },
  autoDeal: { marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  autoDealRtl: { flexDirection: "row-reverse" },
  autoDealCopy: { flex: 1, gap: 2 },
  autoDealText: { color: "#fafaf9", fontWeight: "800", fontSize: 16 },
  autoDealHint: { color: "#a8a29e", fontSize: 13 },
  deal: {
    marginTop: 12,
    backgroundColor: "#f8d66d",
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#e8ba35",
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  dealBusy: { opacity: 0.7 },
  dealText: { color: "#1c1917", fontWeight: "900", fontSize: 18, letterSpacing: 0.4 },
  signIn: {
    backgroundColor: "#10251e",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#29483d",
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
  actionDisabled: { opacity: 0.42 },
  kindGrid: { flexDirection: "row", gap: 12, marginTop: 12 },
  kindGridRtl: { flexDirection: "row-reverse" },
  kindCard: {
    flex: 1,
    minHeight: 120,
    backgroundColor: "#10251e",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#29483d",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 16,
  },
  kindIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#183a2f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  kindTitle: { color: "#fff2bd", fontWeight: "900", fontSize: 17, lineHeight: 21, textAlign: "center" },
  joinCode: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#416055",
    backgroundColor: "#10251e",
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  joinCodeRtl: { flexDirection: "row-reverse" },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#f8d66d",
    alignItems: "center",
    justifyContent: "center",
  },
  joinCodeText: { color: "#fff2bd", fontWeight: "900", fontSize: 17, letterSpacing: 0.2 },
  code: { textAlign: "center", letterSpacing: 4, fontSize: 20, fontWeight: "800" },
});
