import { useRef, useState } from "react";
import { Modal, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdBanner } from "@/ads/AdBanner";
import { tableAdAllowed } from "@/ads/placement";
import { useGameSession } from "@/game/GameSession";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { ActionDock, PokerTableLayout, TableMenu, TalkButton, type SeatSlot } from "@/game/PokerTableLayout";
import type { Card } from "@/game/types";
import { API_URL } from "@/game/api";
import { t } from "@/i18n";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <View>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.infoValue} selectable>
          {value}
        </Text>
        <Pressable onPress={() => void copy()} hitSlop={8} accessibilityLabel={copied ? t("copied") : t("copy")}>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={22} color="#f6d36b" />
        </Pressable>
      </View>
    </View>
  );
}

export default function TableScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { credentials, state, error, dismissError, startHand, act, leave, removePlayer, transferAdmin, rebuy } = useGameSession();
  const video = useTableVideo(credentials);
  const [sheet, setSheet] = useState<"stats" | "admin" | null>(null);
  const [info, setInfo] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyChips, setBuyChips] = useState(0);
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const you = state?.you;
  const pot = state?.pots.reduce((sum, entry) => sum + entry.size, 0) ?? 0;
  const buyStep = Math.max(1, state?.bigBlind ?? 1);

  function stopBuy() {
    if (holdStart.current) clearTimeout(holdStart.current);
    if (hold.current) clearInterval(hold.current);
    holdStart.current = null;
    hold.current = null;
  }

  function startBuy(direction: -1 | 1) {
    stopBuy();
    setBuyChips((value) => Math.max(1, value + direction * buyStep));
    holdStart.current = setTimeout(() => {
      hold.current = setInterval(() => setBuyChips((value) => Math.max(1, value + direction * buyStep)), 70);
    }, 320);
  }

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
    const link = `${API_URL}/join?${new URLSearchParams({
      game: credentials.gameId,
      ...(state?.password ? { password: state.password } : {}),
    })}`;
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
          winners={state?.round == null ? (state?.lastWinners ?? []) : []}
          onDeal={state?.you?.isAdmin && state.round == null ? startHand : undefined}
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
                    {sheet === "stats" ? ` · ${player.stack} · ${t("putIn", { n: player.bought ?? 0 })}` : ""}
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
        <Modal visible={info} transparent animationType="fade" onRequestClose={() => setInfo(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setInfo(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t("tableInfo")}</Text>
              <CopyField label={t("tableId")} value={credentials.gameId} />
              {state?.password ? <CopyField label={t("password")} value={state.password} /> : null}
              {state ? (
                <Text style={styles.statsLine}>
                  {t("blindsAndBuyIn", { small: state.smallBlind, big: state.bigBlind, buyIn: state.buyIn })}
                </Text>
              ) : null}
              <Pressable style={styles.cancel} onPress={shareTable}>
                <Text style={styles.cancelText}>{t("shareTable")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={buying} transparent animationType="fade" onRequestClose={() => setBuying(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setBuying(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t("buyMore")}</Text>
              <View style={styles.buyRow}>
                <Pressable style={styles.buyStep} onPressIn={() => startBuy(-1)} onPressOut={stopBuy}>
                  <Text style={styles.buyStepText}>−</Text>
                </Pressable>
                <Text style={styles.buyChips}>{buyChips}</Text>
                <Pressable style={styles.buyStep} onPressIn={() => startBuy(1)} onPressOut={stopBuy}>
                  <Text style={styles.buyStepText}>+</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  rebuy(buyChips);
                  setBuying(false);
                }}
              >
                <Text style={styles.cancelText}>{t("buyMore")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>
              {error === "Bet size is outside the allowed range" && you?.chipRange
                ? t("betOutOfRange", { min: you.chipRange.min, max: you.chipRange.max })
                : error}
            </Text>
            <Pressable onPress={dismissError} hitSlop={8}>
              <Ionicons name="close" size={18} color="#fecaca" />
            </Pressable>
          </View>
        ) : null}
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("tableInfo"), icon: "info", onPress: () => setInfo(true) },
              { label: t("statistics"), icon: "stats", onPress: () => setSheet("stats") },
              {
                label: t("buyMore"),
                icon: "buy" as const,
                onPress: () => {
                  setBuyChips(state?.buyIn ?? state?.bigBlind ?? 1);
                  setBuying(true);
                },
              },
              ...(state?.you?.isAdmin
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
        <TalkButton on={video.micOn} onTalk={video.setMic} />
      </View>
      <ActionDock
        yourTurn={(you?.legalActions.length ?? 0) > 0}
        actions={you?.legalActions ?? []}
        chipRange={you?.chipRange ?? null}
        step={state?.bigBlind ?? 1}
        cards={you?.holeCards ?? []}
        onAction={(action, chips) => act(action, chips)}
      />
      <View style={{ paddingBottom: insets.bottom, backgroundColor: "#0c0a09" }}>
        <View style={styles.ad}>{tableAdAllowed(state) ? <AdBanner /> : null}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07110d", ...(Platform.OS === "web" ? null : { direction: "ltr" as const }) },
  meta: { color: "#d6d3d1", padding: 24 },
  stage: { flex: 1, minHeight: 0 },
  ad: { height: 50, width: "100%", backgroundColor: "#292524", alignItems: "center", overflow: "hidden" },
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
  infoLabel: { color: "#a8a29e", fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoValue: { color: "#fafaf9", fontSize: 22, fontWeight: "900", letterSpacing: 2, flex: 1 },
  cancel: {
    marginTop: 6,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#292524",
  },
  cancelText: { color: "#fafaf9", fontWeight: "700" },
  buyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  buyStep: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#292524", alignItems: "center", justifyContent: "center" },
  buyStepText: { color: "#fafaf9", fontSize: 28, lineHeight: 32 },
  buyChips: { color: "#fafaf9", fontSize: 32, fontWeight: "700" },
  error: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 76,
    zIndex: 30,
    elevation: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#450a0a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: { color: "#fecaca", flex: 1 },
});
