import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "@/game/api";
import { isRtl, t } from "@/i18n";

/** Shown once, before anything else, until the player accepts the current terms. */
export function TermsGate({ onAccept }: { onAccept: () => void }) {
  const insets = useSafeAreaInsets();
  const align = isRtl() ? "right" : "left";
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { textAlign: align }]} accessibilityRole="header">{t("termsTitle")}</Text>
        <Text style={[styles.intro, { textAlign: align }]}>{t("termsIntro")}</Text>
        <Text style={[styles.copy, { textAlign: align }]}>{t("termsRules")}</Text>
        <Text
          style={[styles.copy, styles.link, { textAlign: align }]}
          onPress={() => void Linking.openURL(`${API_URL}/terms`)}
          accessibilityRole="link"
        >
          {t("termsRead")}
        </Text>
      </ScrollView>
      <Pressable style={styles.accept} onPress={onAccept} accessibilityRole="button" accessibilityLabel={t("termsAccept")}>
        <Text style={styles.acceptText}>{t("termsAccept")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b16", paddingHorizontal: 22 },
  body: { paddingTop: 16, paddingBottom: 16 },
  title: { color: "#f7f7fc", fontSize: 28, fontWeight: "900", marginBottom: 12, width: "100%" },
  intro: { color: "#c7c9d9", fontSize: 16, lineHeight: 23, marginBottom: 12, width: "100%" },
  copy: { color: "#a6a8b8", fontSize: 16, lineHeight: 24, marginBottom: 16, width: "100%" },
  link: { color: "#a8b2ff", fontWeight: "800" },
  accept: { backgroundColor: "#f3a66f", borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  acceptText: { color: "#2a1608", fontSize: 17, fontWeight: "900" },
});
