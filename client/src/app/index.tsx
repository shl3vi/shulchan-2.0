import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameSession } from "@/game/GameSession";
import { useKeyboardInset } from "@/game/useKeyboardInset";
import { isRtl, t } from "@/i18n";

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
  const nameInput = useRef<TextInput>(null);

  async function create() {
    if (name.trim().length === 0) {
      setNameMissing(true);
      scroll.current?.scrollTo({ y: 0, animated: true });
      nameInput.current?.focus();
      return;
    }
    setNameMissing(false);
    setError(null);
    setBusy(true);
    try {
      await session.createAndSit(name.trim(), smallBlind, buyIn);
      router.push("/table");
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
      {seated ? (
        <Pressable style={styles.return} onPress={() => router.push("/table")}>
          <Text style={styles.returnTitle}>{t("atTable")}</Text>
          <Text style={styles.returnText}>{t("backToSeat")}</Text>
        </Pressable>
      ) : null}
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
        />
        <Text style={[styles.label, { textAlign: align }]}>{t("smallBlind")}</Text>
        <ChipRow values={BLINDS} selected={smallBlind} minimum={1} onSelect={setSmallBlind} onValidity={setBlindOk} />
        <Text style={[styles.label, { textAlign: align }]}>{t("buyIn")}</Text>
        <ChipRow values={BUY_INS} selected={buyIn} minimum={11} onSelect={setBuyIn} onValidity={setBuyInOk} />
        <Pressable style={[styles.deal, (busy || seated || !blindOk || !buyInOk) && styles.dealBusy]} disabled={busy || seated || !blindOk || !buyInOk} onPress={create}>
          <Text style={styles.dealText}>{busy ? t("shuffling") : t("dealMeIn")}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", paddingHorizontal: 20 },
  mark: { color: "#f6d36b", fontSize: 36, fontWeight: "900", letterSpacing: 4, textAlign: "center" },
  tag: { color: "#d6d3d1", textAlign: "center", marginTop: 8, marginBottom: 22, fontSize: 15 },
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
  error: { color: "#fecaca", marginTop: 4 },
});
