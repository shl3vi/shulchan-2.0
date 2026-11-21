import { useEffect } from "react";
import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams } from "expo-router";
import { UpdateNotice } from "@/game/UpdateNotice";
import { updateMode } from "@/game/remoteConfig";
import { useGameSession } from "@/game/GameSession";
import { preloadSfx, sleepSfx } from "@/game/sfx";
import { games, isGameKind, kindOf } from "@/games/registry";
import { t } from "@/i18n";
import { HomeButton } from "@/table/TableParts";
import { tableStyles as styles } from "@/table/tableStyles";
import { useTableAttention } from "@/table/useTableAttention";

/**
 * The table: sign-in, loading and forced updates, then the game's own screen.
 * The lobby passes the game it opened, so that game's screen can show before the first snapshot.
 */
export default function TableScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { credentials, state, error } = useGameSession();
  const mode = updateMode();
  useTableAttention(state);

  useEffect(() => {
    preloadSfx();
    return () => sleepSfx();
  }, []);

  if (mode === "force") {
    return (
      <View style={[styles.screen, styles.updateHold]}>
        <StatusBar style="light" />
        <UpdateNotice mode="force" />
      </View>
    );
  }

  if (!credentials) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <HomeButton />
        <Text style={styles.meta}>{error ?? t("sitFirst")}</Text>
      </View>
    );
  }

  const resolved = state ? kindOf(state.game.kind) : isGameKind(kind) ? kind : null;
  if (resolved == null) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <Text style={styles.meta}>{t("sittingDown")}</Text>
      </View>
    );
  }

  const { Screen } = games[resolved];
  return <Screen credentials={credentials} />;
}
