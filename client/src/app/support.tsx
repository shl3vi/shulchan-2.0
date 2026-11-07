import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isRtl, t } from "@/i18n";

const categories = ["bug", "suggestion", "complaint"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRtl() ? "right" : "left";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("bug");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const emailOk = EMAIL.test(email.trim());
  const ready = name.trim().length > 0 && emailOk && message.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />
      <View style={[styles.header, isRtl() && styles.headerRtl]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("cancel")}>
          <Ionicons name={isRtl() ? "chevron-forward" : "chevron-back"} size={26} color="#f7f7fc" />
        </Pressable>
        <Text style={styles.title}>{t("support")}</Text>
      </View>
      {sent ? (
        <Text style={[styles.thanks, { textAlign: align }]}>{t("supportThanks")}</Text>
      ) : (
        <>
          <Text style={[styles.label, { textAlign: align }]}>{t("supportName")}</Text>
          <TextInput style={[styles.input, { textAlign: align }]} value={name} onChangeText={setName} placeholderTextColor="#78716c" />
          <Text style={[styles.label, { textAlign: align }]}>{t("supportEmail")}</Text>
          <TextInput
            style={[styles.input, emailTouched && !emailOk && styles.inputInvalid, { textAlign: align }]}
            value={email}
            onChangeText={setEmail}
            onBlur={() => setEmailTouched(true)}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholderTextColor="#78716c"
          />
          {emailTouched && !emailOk ? (
            <Text style={[styles.invalid, { textAlign: align }]}>{t("supportEmailInvalid")}</Text>
          ) : null}
          <Text style={[styles.label, { textAlign: align }]}>{t("supportCategory")}</Text>
          <View style={[styles.categories, isRtl() && styles.categoriesRtl]}>
            {categories.map((item) => {
              const selected = item === category;
              const label = item === "bug" ? t("supportBug") : item === "suggestion" ? t("supportSuggestion") : t("supportComplaint");
              return (
                <Pressable
                  key={item}
                  style={[styles.category, selected && styles.categorySelected]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.label, { textAlign: align }]}>{t("supportMessage")}</Text>
          <TextInput
            style={[styles.input, styles.message, { textAlign: align }]}
            value={message}
            onChangeText={setMessage}
            multiline
            placeholderTextColor="#78716c"
          />
          <Pressable
            style={({ pressed }) => [styles.send, !ready && styles.sendDisabled, pressed && ready && styles.pressed]}
            disabled={!ready}
            onPress={() => setSent(true)}
          >
            <Text style={styles.sendText}>{t("supportSend")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b16", paddingHorizontal: 22 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 22 },
  headerRtl: { flexDirection: "row-reverse" },
  title: { color: "#f7f7fc", fontSize: 22, fontWeight: "900" },
  label: { color: "#a6a8b8", fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  inputInvalid: { borderColor: "#fecaca" },
  invalid: { color: "#fecaca", fontSize: 13, marginTop: 6 },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.18)",
    backgroundColor: "rgba(20, 23, 42, 0.82)",
    color: "#f7f7fc",
    paddingHorizontal: 14,
    fontSize: 16,
  },
  message: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  categories: { flexDirection: "row", gap: 8 },
  categoriesRtl: { flexDirection: "row-reverse" },
  category: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  categorySelected: { backgroundColor: "rgba(168, 178, 255, 0.18)", borderColor: "#a8b2ff" },
  categoryText: { color: "#c7c9d9", fontSize: 14, fontWeight: "700" },
  categoryTextSelected: { color: "#f7f7fc" },
  send: {
    marginTop: 20,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#e8a06a",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: "#2a130a", fontSize: 17, fontWeight: "900" },
  pressed: { opacity: 0.8 },
  thanks: { color: "#f7f7fc", fontSize: 18, fontWeight: "700", lineHeight: 26 },
});
