import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTACT_EMAIL } from "@/game/support";
import { isRtl, t } from "@/i18n";

const sections = [
  ["legalPlayTitle", "legalPlay"],
  ["legalAccountTitle", "legalAccount"],
  ["legalPrivacyTitle", "legalPrivacy"],
] as const;

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const align = isRtl() ? "right" : "left";
  const textWidth = useWindowDimensions().width - 44;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <StatusBar style="light" />
      <View style={[styles.header, isRtl() && styles.headerRtl]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("cancel")}>
          <Ionicons name={isRtl() ? "chevron-forward" : "chevron-back"} size={26} color="#f7f7fc" />
        </Pressable>
        <Text style={styles.title}>{t("legal")}</Text>
      </View>
      <ScrollView
        style={{ width: textWidth }}
        contentContainerStyle={[styles.body, { width: textWidth, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { textAlign: align }]}>{t("legalIntro")}</Text>
        {sections.map(([title, body]) => (
          <View key={title}>
            <Text style={[styles.heading, { textAlign: align }]}>{t(title)}</Text>
            <Text style={[styles.copy, { textAlign: align }]}>{t(body)}</Text>
          </View>
        ))}
        <Text style={[styles.heading, { textAlign: align }]}>{t("legalAccessTitle")}</Text>
        <Text style={[styles.copy, { textAlign: align }]}>{t("legalAccess")}</Text>
        <Text style={[styles.copy, { textAlign: align }]}>
          {t("legalAccessContact")}{" "}
          <Text
            style={styles.link}
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            accessibilityRole="link"
          >
            {CONTACT_EMAIL}
          </Text>
        </Text>
        <Text style={[styles.updated, { textAlign: align }]}>{t("legalAccessUpdated")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090b16", paddingHorizontal: 22 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  headerRtl: { flexDirection: "row-reverse" },
  title: { color: "#f7f7fc", fontSize: 22, fontWeight: "900" },
  body: { paddingTop: 8, width: "100%" },
  intro: { color: "#c7c9d9", fontSize: 16, lineHeight: 23, marginBottom: 8, width: "100%" },
  heading: { color: "#f7f7fc", fontSize: 17, fontWeight: "800", marginTop: 22, marginBottom: 8, width: "100%" },
  copy: { color: "#a6a8b8", fontSize: 15, lineHeight: 22, width: "100%" },
  link: { color: "#a8b2ff", fontWeight: "800" },
  updated: { color: "#8f91a3", fontSize: 13, lineHeight: 18, marginTop: 14, width: "100%" },
});
