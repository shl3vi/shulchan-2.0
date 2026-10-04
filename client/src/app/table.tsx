import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameSession } from "@/game/GameSession";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { ActionDock, PokerTableLayout, TableMenu, type SeatSlot } from "@/game/PokerTableLayout";
import type { Card } from "@/game/types";
import { API_URL } from "@/game/api";
import { t } from "@/i18n";

export default function TableScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { credentials, state, error, startHand, act, leave, removePlayer } = useGameSession();
  const video = useTableVideo(credentials);
  const [amount, setAmount] = useState("");
  const [stats, setStats] = useState(false);
  const you = state?.you;
  const pot = state?.pots.reduce((sum, entry) => sum + entry.size, 0) ?? 0;

  if (!credentials) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
        <Text style={styles.meta}>{t("sitFirst")}</Text>
      </View>
    );
  }

  const winnerSeats = new Set(state?.round == null ? (state?.lastWinners ?? []).map((winner) => winner.seat) : []);
  const seats: Array<SeatSlot | undefined> = [];
  for (const player of state?.players ?? []) {
    const isYou = player.id === you?.id;
    const track = video.tracks.get(player.id);
    seats[player.seat] = {
      name: player.name,
      stack: player.stack,
      bet: player.betSize,
      toAct: state?.playerToActId === player.id,
      isYou,
      winner: winnerSeats.has(player.seat),
      video: track ? <SeatVideo track={track} /> : undefined,
    };
  }

  function shareTable() {
    const link = `${API_URL}/join?${new URLSearchParams({ game: credentials.gameId, password: credentials.password })}`;
    Share.share({ message: t("shareMessage", { link }) });
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <PokerTableLayout
          seats={seats}
          shown={(state?.shownCards ?? []).reduce<Card[][]>((cards, shown) => {
            cards[shown.seat] = shown.cards;
            return cards;
          }, [])}
          community={state?.communityCards ?? []}
          pot={pot}
          round={state?.round ?? null}
          winners={state?.lastWinners ?? []}
          onDeal={credentials.adminSecret && state?.round == null ? startHand : undefined}
        />
        {stats ? (
          <View style={styles.stats}>
            {(state?.players ?? []).length === 0 ? <Text style={styles.statsLine}>{t("noPlayers")}</Text> : null}
            {(state?.players ?? []).map((player) => (
              <View key={player.id} style={styles.statsRow}>
                <Text style={styles.statsLine}>
                  {player.name} · {player.stack}
                </Text>
                {credentials.adminSecret && player.id !== you?.id ? (
                  <Pressable onPress={() => removePlayer(player.id)}>
                    <Text style={styles.remove}>{t("remove")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Text style={styles.statsLine}>{t("pot", { n: pot })}</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("statistics"), icon: "stats", onPress: () => setStats((value) => !value) },
              { label: t("shareTable"), icon: "share", onPress: shareTable },
              {
                label: t("leaveGame"),
                icon: "leave",
                danger: true,
                onPress: () => {
                  void leave().then(() => router.replace("/"));
                },
              },
            ]}
          />
        </View>
      </View>
      <ActionDock
        yourTurn={(you?.legalActions.length ?? 0) > 0}
        actions={you?.legalActions ?? []}
        amount={amount}
        cards={you?.holeCards ?? []}
        onAmount={setAmount}
        onTalk={() => video.toggleMic()}
        micOn={video.micOn}
        onAction={(action) => act(action, action === "bet" || action === "raise" ? Number(amount) : undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", direction: "ltr" },
  meta: { color: "#d6d3d1", padding: 24 },
  stage: { flex: 1, minHeight: 0 },
  home: {
    position: "absolute",
    left: 12,
    zIndex: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(12,10,9,0.78)",
    borderWidth: 1,
    borderColor: "rgba(246,211,107,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  menu: { position: "absolute", right: 12, zIndex: 8 },
  stats: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 3,
    backgroundColor: "rgba(12,10,9,0.92)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#44403c",
    padding: 12,
    gap: 4,
  },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statsLine: { color: "#fafaf9", fontSize: 14 },
  remove: { color: "#fecaca", fontWeight: "800" },
  error: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 8,
    zIndex: 3,
    color: "#fecaca",
    backgroundColor: "#450a0a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: "hidden",
  },
});
