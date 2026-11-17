import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "@/i18n";
import { reportCrash } from "@/monitoring/crashes";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Shows a way back instead of a white screen when a screen throws while drawing. */
export class CrashScreen extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportCrash(error, "render");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{t("crashTitle")}</Text>
        <Text style={styles.body}>{t("crashBody")}</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => this.setState({ failed: false })}>
          <Text style={styles.buttonText}>{t("crashRetry")}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#090b16" },
  title: { color: "#f7f7fc", fontSize: 22, fontWeight: "800", textAlign: "center" },
  body: { color: "rgba(247, 247, 252, 0.75)", fontSize: 16, textAlign: "center" },
  button: { marginTop: 12, backgroundColor: "#f6d36b", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: "#1c1917", fontSize: 16, fontWeight: "800" },
});
