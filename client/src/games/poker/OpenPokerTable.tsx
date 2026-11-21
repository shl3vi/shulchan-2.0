import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRemoteConfig } from "@/game/UpdateNotice";
import { pokerConfig } from "@/games/poker/types";
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

/** Blinds, buy-in and auto-deal for a new poker table. Reports null while a typed amount is not valid. */
export function OpenPokerTable({ onChange }: { onChange: (settings: object | null) => void }) {
  const align = isRtl() ? "right" : "left";
  const config = useRemoteConfig();
  const [smallBlind, setSmallBlind] = useState(1);
  const [buyIn, setBuyIn] = useState(100);
  const [blindOk, setBlindOk] = useState(true);
  const [buyInOk, setBuyInOk] = useState(true);
  const [autoDeal, setAutoDeal] = useState(true);
  const autoDealTouched = useRef(false);
  useEffect(() => {
    if (!autoDealTouched.current) setAutoDeal(pokerConfig(config.games.poker).autoDealDefault);
  }, [config]);
  const turnSeconds = pokerConfig(config.games.poker).turnSecondsDefault;
  useEffect(() => {
    onChange(blindOk && buyInOk ? { smallBlind, buyIn, autoDeal, turnSeconds } : null);
  }, [onChange, smallBlind, buyIn, blindOk, buyInOk, autoDeal, turnSeconds]);

  return (
    <>
      <Text style={[styles.label, { textAlign: align }]}>{t("smallBlind")}</Text>
      <ChipRow values={BLINDS} selected={smallBlind} minimum={1} onSelect={setSmallBlind} onValidity={setBlindOk} />
      <Text style={[styles.label, { textAlign: align }]}>{t("buyIn")}</Text>
      <ChipRow values={BUY_INS} selected={buyIn} minimum={11} onSelect={setBuyIn} onValidity={setBuyInOk} />
      <Pressable
        style={[styles.autoDeal, isRtl() && styles.autoDealRtl]}
        onPress={() => {
          autoDealTouched.current = true;
          setAutoDeal((on) => !on);
        }}
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
  );
}

const styles = StyleSheet.create({
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
  error: { color: "#fecaca", marginTop: 8 },
});
