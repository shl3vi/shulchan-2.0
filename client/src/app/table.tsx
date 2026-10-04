import { useState } from "react";
import { Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
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
  const { credentials, state, error, startHand, act, leave, removePlayer, transferAdmin } = useGameSession();
  const video = useTableVideo(credentials);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"stats" | "admin" | null>(null);
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
        <Modal visible={sheet != null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{sheet === "admin" ? t("adminOptions") : t("statistics")}</Text>
              {(state?.players ?? []).length === 0 ? <Text style={styles.statsLine}>{t("noPlayers")}</Text> : null}
              {(state?.players ?? []).map((player) => (
                <View key={player.id} style={styles.statsRow}>
                  <Text style={styles.statsLine}>
                    {player.name}
                    {sheet === "stats" ? ` · ${player.stack}` : ""}
                  </Text>
                  {sheet === "admin" && player.id !== you?.id ? (
                    <View style={styles.statsActions}>
                      <Pressable onPress={() => transferAdmin(player.id)}>
                        <Text style={styles.makeAdmin}>{t("makeAdmin")}</Text>
                      </Pressable>
                      <Pressable onPress={() => removePlayer(player.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#fecaca" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
              {sheet === "stats" ? <Text style={styles.statsLine}>{t("pot", { n: pot })}</Text> : null}
              <Pressable style={styles.cancel} onPress={() => setSheet(null)}>
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("statistics"), icon: "stats", onPress: () => setSheet("stats") },
              ...(credentials.adminSecret
                ? [{ label: t("adminOptions"), icon: "admin" as const, onPress: () => setSheet("admin") }]
                : []),
              { label: t("shareTable"), icon: "share" as const, onPress: shareTable },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(12,10,9,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#44403c",
    padding: 16,
    gap: 10,
  },
  sheetTitle: { color: "#f6d36b", fontSize: 18, fontWeight: "800" },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statsActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  statsLine: { color: "#fafaf9", fontSize: 16, flexShrink: 1 },
  makeAdmin: { color: "#f6d36b", fontWeight: "800" },
  cancel: {
    marginTop: 6,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#292524",
  },
  cancelText: { color: "#fafaf9", fontWeight: "700" },
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
