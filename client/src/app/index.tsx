import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hostSession, redeemHostCode, signInUrl, signInWithApple } from "@/game/api";
import { useGameSession } from "@/game/GameSession";
import { loadHost, saveHost, type Host } from "@/game/hostStore";
import { nameProblem, playerName } from "@/game/name";
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
          <Ionicons name="add" size={18} color={custom || !preset ? "#171b35" : "#c7c9d9"} />
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
          placeholderTextColor="#73758b"
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      const next = alive?.name && alive.name !== saved.name ? { ...saved, name: alive.name } : saved;
      if (next !== saved) await saveHost(next);
      setHost(next);
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

  async function signInApple() {
    setError(null);
    setBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error(t("serverUnreachable"));
      const given = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
      const next = await signInWithApple(credential.identityToken, given || undefined);
      setHost(next);
      await saveHost(next);
    } catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "ERR_REQUEST_CANCELED") return;
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

  function openSettingsPage(path: "/profile" | "/support") {
    setSettingsOpen(false);
    router.push(path);
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
      setJoinError(nameProblem(joinName) === "blocked" ? t("nameRejected") : t("nameLength"));
      return;
    }
    setJoinError(null);
    setJoinBusy(true);
    try {
      await session.join(seatedName, normalizeCode(joinGame), joinPassword.trim());
      router.push("/table");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("couldNotJoin");
      setJoinError(message === "Choose another name" ? t("nameRejected") : message);
    } finally {
      setJoinBusy(false);
    }
  }

  async function create(nextKind: "poker" | "backgammon" = "poker") {
    const seatedName = playerName(name);
    if (!seatedName) {
      setNameMissing(true);
      setError(nameProblem(name) === "blocked" ? t("nameRejected") : t("nameLength"));
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
      if (message === "Sign in to open a table" || message === "Sign in with Google to open a table") {
        setHost(null);
        setKind(null);
        setError(null);
        await saveHost(null);
        return;
      }
      setError(message === "Choose another name" ? t("nameRejected") : message);
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
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && styles.buttonPressed]}
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("settings")}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={21} color="#c8ceff" />
        </Pressable>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="game-controller" size={20} color="#171b35" />
          </View>
          <Text style={styles.mark}>SHULCHAN</Text>
        </View>
        <Text style={styles.tag}>{t("tagline")}</Text>
        <View style={styles.heroArt}>
          <View style={styles.heroHalo} />
          <View style={[styles.gameTile, styles.gameTileLeft]}>
            <Ionicons name="dice" size={31} color="#f3a66f" />
          </View>
          <View style={styles.tableTop}>
            <View style={styles.tableInner}>
              <Ionicons name="diamond" size={28} color="#f3a66f" />
              <View style={styles.cardStack}>
                <View style={[styles.miniCard, styles.miniCardBack]} />
                <View style={styles.miniCard}>
                  <Ionicons name="heart" size={14} color="#ef6461" />
                </View>
              </View>
            </View>
          </View>
          <View style={[styles.gameTile, styles.gameTileRight]}>
            <Ionicons name="people" size={29} color="#f3a66f" />
          </View>
        </View>
      </View>
      {host ? (
        <View style={styles.helloRow}>
          <Text style={styles.hello}>{t("hello", { name: host.name?.trim() || host.email.split("@")[0] || host.email })}</Text>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.logout}>{t("logout")}</Text>
          </Pressable>
        </View>
      ) : null}
      {seated ? (
        <Pressable
          style={({ pressed }) => [styles.return, pressed && styles.buttonPressed]}
          onPress={() => router.push("/table")}
          accessibilityRole="button"
        >
          <View style={styles.returnIcon}>
            <Ionicons name="play" size={24} color="#2a130a" />
          </View>
          <View style={styles.returnCopy}>
            <Text style={styles.returnTitle}>{t("atTable")}</Text>
            <Text style={styles.returnText}>{t("backToSeat")}</Text>
          </View>
          <Ionicons name={isRtl() ? "arrow-back" : "arrow-forward"} size={22} color="#2a130a" />
        </Pressable>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.joinCode,
          styles.primaryAction,
          isRtl() && styles.joinCodeRtl,
          styles.createButton,
          pressed && styles.buttonPressed,
          (busy || seated) && styles.actionDisabled,
        ]}
        disabled={busy || seated}
        onPress={openCreate}
        accessibilityRole="button"
      >
        <View style={[styles.actionIcon, styles.primaryActionIcon]}>
          <Ionicons name="add" size={20} color="#2a130a" />
        </View>
        <Text style={[styles.joinCodeText, styles.primaryActionText]}>{t("createTable")}</Text>
        <Ionicons
          name={isRtl() ? "arrow-back" : "arrow-forward"}
          size={20}
          color="#2a130a"
          style={styles.actionArrow}
        />
      </Pressable>
      {creating && !host ? (
        <View style={styles.signIn}>
          <Text style={[styles.signInHint, { textAlign: align }]}>{t("signInToCreate")}</Text>
          <View style={styles.signInChoices}>
            <Pressable
              style={[styles.google, isRtl() && styles.googleRtl, busy && styles.googleBusy]}
              disabled={busy}
              onPress={signIn}
              accessibilityRole="button"
            >
              <Image source={require("../../assets/images/google-g.png")} style={styles.googleG} contentFit="contain" />
              <Text style={styles.googleText}>{t("signInGoogle")}</Text>
            </Pressable>
            {Platform.OS === "ios" ? (
              <Pressable
                style={[styles.apple, isRtl() && styles.googleRtl, busy && styles.googleBusy]}
                disabled={busy}
                onPress={signInApple}
                accessibilityRole="button"
              >
                <Ionicons name="logo-apple" size={18} color="#fff" />
                <Text style={styles.appleText}>{t("signInApple")}</Text>
              </Pressable>
            ) : null}
          </View>
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
              <Ionicons name="dice" size={31} color="#f3a66f" />
            </View>
            <Text style={styles.kindTitle} numberOfLines={2}>{t("backgammonTable")}</Text>
          </Pressable>
          <Pressable style={styles.kindCard} onPress={() => setKind("poker")}>
            <View style={styles.kindIcon}>
              <Ionicons name="diamond" size={29} color="#f3a66f" />
            </View>
            <Text style={styles.kindTitle} numberOfLines={2}>{t("pokerTable")}</Text>
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
            placeholderTextColor="#73758b"
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
            <Ionicons name={autoDeal ? "checkbox" : "square-outline"} size={22} color="#a8b2ff" />
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
          style={({ pressed }) => [
            styles.joinCode,
            styles.secondaryAction,
            isRtl() && styles.joinCodeRtl,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            setCreating(false);
            setKind(null);
            setJoining((open) => !open);
          }}
          accessibilityRole="button"
        >
          <View style={styles.actionIcon}>
            <Ionicons name="enter-outline" size={20} color="#a8b2ff" />
          </View>
          <Text style={styles.joinCodeText}>{t("joinWithId")}</Text>
          <Ionicons
            name={isRtl() ? "arrow-back" : "arrow-forward"}
            size={20}
            color="#a8b2ff"
            style={styles.actionArrow}
          />
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
            placeholderTextColor="#73758b"
          />
          <Text style={[styles.label, { textAlign: align }]}>{t("password")}</Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={joinPassword}
            onChangeText={setJoinPassword}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor="#73758b"
          />
          <Text style={[styles.label, { textAlign: align }]}>{t("yourName")}</Text>
          <TextInput
            style={[styles.input, { textAlign: align }]}
            value={joinName}
            onChangeText={setJoinName}
            autoCapitalize="words"
            placeholder={t("enterYourName")}
            placeholderTextColor="#73758b"
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
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.settingsBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable
            style={[styles.settingsSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}
            onPress={() => {}}
          >
            <View style={[styles.settingsHeader, isRtl() && styles.settingsHeaderRtl]}>
              <View style={styles.settingsTitleRow}>
                <View style={styles.settingsTitleIcon}>
                  <Ionicons name="settings-outline" size={20} color="#c8ceff" />
                </View>
                <Text style={styles.settingsTitle}>{t("settings")}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.settingsClose, pressed && styles.buttonPressed]}
                onPress={() => setSettingsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t("cancel")}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color="#c7c9d9" />
              </Pressable>
            </View>
            <View style={styles.accountCard}>
              <Pressable
                style={({ pressed }) => [styles.settingsRow, isRtl() && styles.settingsRowRtl, pressed && styles.buttonPressed]}
                onPress={() => openSettingsPage("/profile")}
              >
                <Ionicons name="person-outline" size={20} color="#a8b2ff" />
                <Text style={[styles.settingsRowText, { textAlign: align }]} numberOfLines={1}>
                  {host?.email ?? t("account")}
                </Text>
                <Ionicons name={isRtl() ? "chevron-back" : "chevron-forward"} size={18} color="#8f91a3" />
              </Pressable>
              <View style={styles.accountDivider} />
              <Pressable
                style={({ pressed }) => [styles.settingsRow, isRtl() && styles.settingsRowRtl, pressed && styles.buttonPressed]}
                onPress={() => openSettingsPage("/support")}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#a8b2ff" />
                <Text style={[styles.settingsRowText, { textAlign: align }]} numberOfLines={1}>{t("support")}</Text>
                <Ionicons name={isRtl() ? "chevron-back" : "chevron-forward"} size={18} color="#8f91a3" />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b16" },
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
    backgroundColor: "#5c4dd8",
    opacity: 0.28,
  },
  glowSide: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    top: 270,
    right: -210,
    backgroundColor: "#e47b4c",
    opacity: 0.14,
  },
  dotField: {
    position: "absolute",
    top: 95,
    right: 24,
    width: 54,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    opacity: 0.3,
  },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#a8b2ff" },
  hero: { alignItems: "center", marginBottom: 22 },
  settingsButton: {
    position: "absolute",
    right: 0,
    top: -2,
    zIndex: 4,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(20, 23, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(168, 178, 255, 0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#a8b2ff",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    shadowColor: "#7c89ff",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  mark: { color: "#f7f7fc", fontSize: 31, fontWeight: "900", letterSpacing: 3.4, textAlign: "center" },
  tag: { color: "#a6a8b8", textAlign: "center", marginTop: 10, fontSize: 15, letterSpacing: 0.15 },
  heroArt: { width: "100%", height: 118, marginTop: 16, alignItems: "center", justifyContent: "center" },
  heroHalo: {
    position: "absolute",
    width: 210,
    height: 88,
    borderRadius: 50,
    backgroundColor: "#6457d9",
    opacity: 0.2,
  },
  tableTop: {
    width: 176,
    height: 94,
    borderRadius: 48,
    padding: 5,
    backgroundColor: "#e6a66c",
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
    borderColor: "#8177d9",
    backgroundColor: "#24204b",
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
    backgroundColor: "rgba(28, 31, 58, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(194, 199, 255, 0.22)",
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
  logout: { color: "#a8b2ff", fontWeight: "800", fontSize: 16 },
  return: {
    backgroundColor: "#f3a66f",
    borderRadius: 24,
    padding: 15,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    shadowColor: "#e8874e",
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
  returnTitle: { color: "#2a130a", fontWeight: "900", fontSize: 18 },
  returnText: { color: "#623922", marginTop: 3, fontSize: 14 },
  felt: {
    backgroundColor: "rgba(20, 23, 42, 0.82)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.16)",
    padding: 18,
    gap: 8,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  feltOff: { opacity: 0.45 },
  label: { color: "#c8ceff", fontWeight: "800", letterSpacing: 0.6, marginTop: 6 },
  input: {
    backgroundColor: "rgba(8, 10, 23, 0.78)",
    color: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(198, 203, 255, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputMissing: { borderColor: "#f87171", borderWidth: 2 },
  customWrap: { gap: 8 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    backgroundColor: "rgba(8, 10, 23, 0.72)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(198, 203, 255, 0.2)",
    paddingVertical: 10,
    alignItems: "center",
  },
  chipOn: { backgroundColor: "#a8b2ff", borderColor: "#a8b2ff" },
  chipText: { color: "#c7c9d9", fontWeight: "800" },
  chipTextOn: { color: "#171b35" },
  autoDeal: { marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  autoDealRtl: { flexDirection: "row-reverse" },
  autoDealCopy: { flex: 1, gap: 2 },
  autoDealText: { color: "#fafaf9", fontWeight: "800", fontSize: 16 },
  autoDealHint: { color: "#a8a29e", fontSize: 13 },
  deal: {
    marginTop: 12,
    backgroundColor: "#f3a66f",
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#e8874e",
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  dealBusy: { opacity: 0.7 },
  dealText: { color: "#2a130a", fontWeight: "900", fontSize: 18, letterSpacing: 0.4 },
  signIn: {
    backgroundColor: "rgba(20, 23, 42, 0.82)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.16)",
    padding: 18,
    gap: 8,
    marginTop: 12,
  },
  signInChoices: { gap: 8, marginTop: 8 },
  google: {
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
  apple: {
    minHeight: 40,
    backgroundColor: "#000",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  appleText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  signInHint: { color: "#E3E3E3", fontSize: 15, marginBottom: 4 },
  error: { color: "#fecaca", marginTop: 8 },
  createButton: { marginTop: 0 },
  actionDisabled: { opacity: 0.42 },
  kindGrid: { flexDirection: "row", gap: 12, marginTop: 12 },
  kindGridRtl: { flexDirection: "row-reverse" },
  kindCard: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 120,
    backgroundColor: "rgba(20, 23, 42, 0.82)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.16)",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 16,
  },
  kindIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(135, 143, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  kindTitle: { color: "#f3f7f5", fontWeight: "900", fontSize: 17, lineHeight: 21, textAlign: "center" },
  joinCode: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.18)",
    backgroundColor: "rgba(20, 23, 42, 0.76)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  joinCodeRtl: { flexDirection: "row-reverse" },
  primaryAction: {
    backgroundColor: "#f3a66f",
    borderColor: "#ffc094",
    shadowColor: "#e8874e",
    shadowOpacity: 0.24,
  },
  secondaryAction: { backgroundColor: "rgba(20, 23, 42, 0.72)" },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(168, 178, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionIcon: { backgroundColor: "rgba(72, 32, 14, 0.1)" },
  joinCodeText: { color: "#f3f7f5", fontWeight: "900", fontSize: 17, letterSpacing: 0.2 },
  primaryActionText: { color: "#2a130a" },
  actionArrow: { marginStart: "auto" },
  code: { textAlign: "center", letterSpacing: 4, fontSize: 20, fontWeight: "800" },
  settingsBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(3, 4, 12, 0.68)",
  },
  settingsSheet: {
    backgroundColor: "#14172a",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(205, 210, 255, 0.18)",
    paddingTop: 18,
    paddingHorizontal: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  settingsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingsHeaderRtl: { flexDirection: "row-reverse" },
  settingsTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsTitleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(168, 178, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsTitle: { color: "#f7f7fc", fontSize: 22, fontWeight: "900" },
  settingsClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountCard: {
    borderRadius: 20,
    backgroundColor: "rgba(9, 11, 22, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.14)",
    overflow: "hidden",
  },
  settingsRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsRowRtl: { flexDirection: "row-reverse" },
  settingsRowText: { flex: 1, color: "#f7f7fc", fontSize: 16, fontWeight: "700" },
  accountDivider: { height: 1, backgroundColor: "rgba(205, 210, 255, 0.1)" },
});
