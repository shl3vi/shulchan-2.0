import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTableAdAllowed } from "@/ads/placement";
import { useGameSession } from "@/game/GameSession";
import { SeatSafety } from "@/game/SeatSafety";
import { TableHold } from "@/game/TableHold";
import { playSfx } from "@/game/sfx";
import type { Credentials } from "@/game/types";
import { pokerView, type Card, type PokerView, type RebuyRule } from "@/games/poker/types";
import { ActionDock, heroDealDelays, PokerTableLayout, SPOTLIGHT_DELAY_MS, type SeatSlot } from "@/games/poker/PokerTableLayout";
import { usePokerMoves } from "@/games/poker/usePokerMoves";
import { t } from "@/i18n";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { CameraButton, TableMenu, TalkButton } from "@/table/TableControls";
import { CopyField, ErrorBanner, HomeButton, shareTable, TableFooter, tableError, VideoNotice } from "@/table/TableParts";
import { tableStyles } from "@/table/tableStyles";
import { useBlockedVideo } from "@/table/useBlockedVideo";

/** Poker's own refusals, by the server's code, then the ones every table shares. */
function pokerError(message: string, code: string | null, range?: { min: number; max: number } | null) {
  if (code === "poker.bet-range" && range) return t("betOutOfRange", { min: range.min, max: range.max });
  if (code === "poker.need-two-with-chips") return t("needTwoWithMoney");
  return tableError(message, code);
}

/** The turn lengths the admin steps through, one tap at a time. */
const TURN_SECONDS_CHOICES = [15, 20, 30, 45, 60, 90, 120];

function nextTurnSeconds(current: number) {
  return TURN_SECONDS_CHOICES.find((seconds) => seconds > current) ?? TURN_SECONDS_CHOICES[0]!;
}

/** Small blinds the admin steps through with − and +. */
const SMALL_BLIND_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 5000, 10000];

function stepBlind(current: number, direction: -1 | 1) {
  if (direction > 0) return SMALL_BLIND_STEPS.find((value) => value > current) ?? current;
  return [...SMALL_BLIND_STEPS].reverse().find((value) => value < current) ?? current;
}

const REBUY_RULES: RebuyRule[] = ["any", "busted", "off"];
const REBUY_LABEL = { any: "rebuyAny", busted: "rebuyBusted", off: "rebuyOff" } as const;

/** Whether this player may buy more chips now under the table's rule. */
function mayRebuy(game: PokerView | null, youId: string | undefined) {
  const rule = game?.rebuy ?? "any";
  if (rule === "any") return true;
  if (rule === "off") return false;
  const me = youId ? game?.seats[youId] : undefined;
  return me != null && me.stack === 0 && !me.inHand;
}

function Stepper({ value, onMinus, onPlus, minusOff, plusOff }: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusOff?: boolean;
  plusOff?: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable style={[styles.stepperButton, minusOff && styles.stepperOff]} onPress={onMinus} disabled={minusOff} hitSlop={6}>
        <Text style={styles.stepperText}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable style={[styles.stepperButton, plusOff && styles.stepperOff]} onPress={onPlus} disabled={plusOff} hitSlop={6}>
        <Text style={styles.stepperText}>+</Text>
      </Pressable>
    </View>
  );
}

export function PokerScreen({ credentials }: { credentials: Credentials }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, error, errorCode, dismissError, setPaused, leave, removePlayer, transferAdmin } = useGameSession();
  const game = pokerView(state);
  const hand = game?.hand ?? null;
  const toActId = state?.status.toAct[0] ?? null;
  const { startHand, setAutoDeal, setTurnSeconds, setTableSettings, act, rebuy } = usePokerMoves();
  const video = useTableVideo(credentials, state?.paused === true, "poker");
  const showAd = useTableAdAllowed(state);
  const [sheet, setSheet] = useState<"stats" | "admin" | null>(null);
  const [info, setInfo] = useState(false);
  const [buying, setBuying] = useState(false);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [buyChips, setBuyChips] = useState(0);
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const you = state?.you;
  const pot = game?.pots.reduce((sum, entry) => sum + entry.size, 0) ?? 0;
  const buyStep = Math.max(1, game?.bigBlind ?? 1);
  // Time left as the server saw it, so a wrong phone clock does not matter.
  const turnDeadline = state?.status.turnDeadline;
  const turnLeftMs = turnDeadline != null && state?.serverNow != null ? Math.max(0, turnDeadline - state.serverNow) : undefined;

  // A different player at this phone starts with no seat open.
  const [seatFor, setSeatFor] = useState(credentials?.playerId);
  if (seatFor !== credentials?.playerId) {
    setSeatFor(credentials?.playerId);
    setSeatId(null);
  }

  useBlockedVideo(video.holdOff, state?.players);

  // Applause for everyone at the table when a poker hand ends, as the winner's seat grows.
  // Not on the first snapshot.
  const lastRound = useRef<string | null | undefined>(undefined);
  const applause = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!game) return;
    const before = lastRound.current;
    lastRound.current = game.round;
    if (before == null || game.round != null || game.lastWinners.length === 0) return;
    if (applause.current) clearTimeout(applause.current);
    applause.current = setTimeout(() => playSfx("applause"), SPOTLIGHT_DELAY_MS);
  }, [game]);
  useEffect(() => () => {
    if (applause.current) clearTimeout(applause.current);
  }, []);

  function stopBuy() {
    if (holdStart.current) clearTimeout(holdStart.current);
    if (hold.current) clearInterval(hold.current);
    holdStart.current = null;
    hold.current = null;
  }

  function startBuy(direction: -1 | 1) {
    stopBuy();
    const cap = game?.buyIn ?? buyStep;
    setBuyChips((value) => Math.min(cap, Math.max(1, value + direction * buyStep)));
    holdStart.current = setTimeout(() => {
      hold.current = setInterval(() => setBuyChips((value) => Math.min(cap, Math.max(1, value + direction * buyStep))), 70);
    }, 320);
  }

  const winnerSeats = new Set(game?.round == null ? (game?.lastWinners ?? []).map((winner) => winner.seat) : []);
  const seats: (SeatSlot | undefined)[] = [];
  for (const player of state?.players ?? []) {
    const isYou = player.id === you?.id;
    const track = video.tracks.get(player.id);
    seats[player.seat] = {
      id: player.id,
      name: player.name,
      stack: game?.seats[player.id]?.stack ?? 0,
      bet: game?.seats[player.id]?.betSize ?? 0,
      toAct: toActId === player.id,
      ...(toActId === player.id && turnLeftMs != null
        ? { turnLeftMs, turnTotalMs: (game?.turnSeconds ?? 30) * 1000, turnStamp: state?.serverNow }
        : {}),
      isYou,
      inHand: game?.seats[player.id]?.inHand ?? false,
      winner: winnerSeats.has(player.seat),
      video: track ? <SeatVideo track={track} /> : undefined,
      cameraOn: isYou ? video.cameraOn : track != null,
    };
  }

  function share() {
    shareTable(credentials.gameId, state?.password);
  }

  if (!state || !game) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <Text style={styles.meta}>{t("sittingDown")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <PokerTableLayout
          seats={seats}
          shown={(game?.shownCards ?? []).reduce<Card[][]>((cards, shown) => {
            cards[shown.seat] = shown.cards;
            return cards;
          }, [])}
          community={game?.communityCards ?? []}
          pot={pot}
          round={game?.round ?? null}
          winners={game?.round == null ? (game?.lastWinners ?? []) : []}
          onDeal={state?.you?.isAdmin && game.round == null && !state.paused ? startHand : undefined}
          onSeat={(index) => {
            const player = state?.players.find((seat) => seat.seat === index);
            if (!player || player.id === you?.id) return;
            setSeatId(player.id);
          }}
        />
        <Modal visible={sheet != null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{sheet === "admin" ? t("adminOptions") : t("statistics")}</Text>
              {sheet === "stats" ? (
                (state?.players ?? []).length === 0 ? (
                  <Text style={styles.statsLine}>{t("noPlayers")}</Text>
                ) : (
                  <View style={styles.statsTable}>
                    <View style={[styles.statsRow, styles.statsHead]}>
                      <Text style={[styles.statsCell, styles.statsHeadText]}>{t("player")}</Text>
                      <Text style={[styles.statsCell, styles.statsNum, styles.statsHeadText]}>{t("stack")}</Text>
                      <Text style={[styles.statsCell, styles.statsNum, styles.statsHeadText]}>{t("putInHeader")}</Text>
                    </View>
                    {(state?.players ?? []).map((player) => (
                      <View key={player.id} style={styles.statsRow}>
                        <Text style={styles.statsCell} numberOfLines={1}>{player.name}</Text>
                        <Text style={[styles.statsCell, styles.statsNum]}>{game.seats[player.id]?.stack ?? 0}</Text>
                        <Text style={[styles.statsCell, styles.statsNum]}>{game.seats[player.id]?.bought ?? 0}</Text>
                      </View>
                    ))}
                    <Text style={styles.statsLine}>{t("pot", { n: pot })}</Text>
                  </View>
                )
              ) : (
                <>
                  <Pressable style={styles.statsRow} onPress={() => { setPaused(state?.paused !== true); setSheet(null); }}>
                    <Text style={styles.statsLine}>{state?.paused ? t("resumeTable") : t("pauseTable")}</Text>
                  </Pressable>
                  <Pressable style={styles.statsRow} onPress={() => setAutoDeal(game?.autoDeal !== true)}>
                    <Text style={styles.statsLine}>{t("autoDeal")}</Text>
                    <Text style={styles.makeAdmin}>{game?.autoDeal ? t("autoDealOn") : t("autoDealOff")}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.statsRow}
                    onPress={() => setTurnSeconds(nextTurnSeconds(game?.turnSeconds ?? 30))}
                    accessibilityRole="button"
                    accessibilityHint={t("turnTimeHint")}
                  >
                    <Text style={styles.statsLine}>{t("turnTime")}</Text>
                    <Text style={styles.makeAdmin}>{t("turnTimeValue", { seconds: game?.turnSeconds ?? 30 })}</Text>
                  </Pressable>
                  {(() => {
                    // The blinds the next hand uses: a pending change, or the current blinds.
                    const plannedSmall = game.nextSmallBlind ?? game.smallBlind;
                    const buyInStep = plannedSmall * 2 * 10;
                    return (
                      <>
                        <View style={styles.statsRow}>
                          <View style={styles.settingCopy}>
                            <Text style={styles.statsLine}>{t("blinds")}</Text>
                            {game.nextSmallBlind != null ? (
                              <Text style={styles.settingHint}>{t("blindsNextHand")}</Text>
                            ) : null}
                          </View>
                          <Stepper
                            value={`${plannedSmall}/${plannedSmall * 2}`}
                            onMinus={() => setTableSettings({ smallBlind: stepBlind(plannedSmall, -1) })}
                            onPlus={() => setTableSettings({ smallBlind: stepBlind(plannedSmall, 1) })}
                            minusOff={stepBlind(plannedSmall, -1) === plannedSmall}
                            plusOff={stepBlind(plannedSmall, 1) === plannedSmall || stepBlind(plannedSmall, 1) * 2 > game.buyIn}
                          />
                        </View>
                        <View style={styles.statsRow}>
                          <Text style={styles.statsLine}>{t("buyIn")}</Text>
                          <Stepper
                            value={String(game.buyIn)}
                            onMinus={() => setTableSettings({ buyIn: Math.max(plannedSmall * 2, game.buyIn - buyInStep) })}
                            onPlus={() => setTableSettings({ buyIn: game.buyIn + buyInStep })}
                            minusOff={game.buyIn <= plannedSmall * 2}
                          />
                        </View>
                        <Pressable
                          style={styles.statsRow}
                          onPress={() => {
                            const rule = game.rebuy ?? "any";
                            setTableSettings({ rebuy: REBUY_RULES[(REBUY_RULES.indexOf(rule) + 1) % REBUY_RULES.length] });
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.statsLine}>{t("rebuys")}</Text>
                          <Text style={styles.makeAdmin}>{t(REBUY_LABEL[game.rebuy ?? "any"])}</Text>
                        </Pressable>
                      </>
                    );
                  })()}
                  {(state?.players ?? []).length === 0 ? <Text style={styles.statsLine}>{t("noPlayers")}</Text> : null}
                  {(state?.players ?? []).map((player) => (
                    <View key={player.id} style={styles.statsRow}>
                      <Text style={styles.statsLine}>{player.name}</Text>
                      {player.id !== you?.id ? (
                        <View style={styles.statsActions}>
                          {player.web ? null : (
                            <Pressable onPress={() => transferAdmin(player.id)}>
                              <Text style={styles.makeAdmin}>{t("makeAdmin")}</Text>
                            </Pressable>
                          )}
                          <Pressable onPress={() => removePlayer(player.id)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={20} color="#fecaca" />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
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
                  {t("blindsAndBuyIn", { small: game.smallBlind, big: game.bigBlind, buyIn: game.buyIn })}
                </Text>
              ) : null}
              <Pressable style={styles.cancel} onPress={share}>
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
        <TableHold
          top={insets.top + 56}
          paused={state?.paused === true}
          idleCloseAt={state?.idleCloseAt}
          serverNow={state?.serverNow}
          isAdmin={state?.you?.isAdmin === true}
          onPause={setPaused}
        />
        {video.videoNotice ? <VideoNotice message={video.videoNotice} onClose={video.dismissVideoNotice} /> : null}
        {error ? <ErrorBanner message={pokerError(error, errorCode, hand?.chipRange)} onClose={dismissError} /> : null}
        <HomeButton />
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("shareTable"), icon: "share" as const, onPress: share },
              { label: t("tableInfo"), icon: "info", onPress: () => setInfo(true) },
              { label: t("statistics"), icon: "stats", onPress: () => setSheet("stats") },
              ...(mayRebuy(game, you?.id)
                ? [{
                    label: t("buyMore"),
                    icon: "buy" as const,
                    onPress: () => {
                      setBuyChips(game?.buyIn ?? game?.bigBlind ?? 1);
                      setBuying(true);
                    },
                  }]
                : []),
              ...(state?.you?.isAdmin
                ? [{ label: t("adminOptions"), icon: "admin" as const, onPress: () => setSheet("admin") }]
                : []),
              {
                label: t("leaveGame"),
                icon: "leave",
                danger: true,
                onPress: () => {
                  void leave().then(() => router.dismissTo("/"));
                },
              },
            ]}
          />
        </View>
        <CameraButton on={video.cameraOn} held={state?.paused} onToggle={video.setCamera} />
        <TalkButton on={video.micOn} onTalk={video.setMic} />
        <Modal visible={seatId != null} transparent animationType="fade" onRequestClose={() => setSeatId(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSeatId(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{state?.players.find((player) => player.id === seatId)?.name}</Text>
              {seatId && state?.players.find((player) => player.id === seatId)?.blocked ? null : (
                <Pressable
                  style={styles.cancel}
                  onPress={() => {
                    if (seatId) video.toggleMute(seatId);
                    setSeatId(null);
                  }}
                >
                  <Text style={styles.cancelText}>{seatId && video.muted.has(seatId) ? t("unmuteSeat") : t("muteSeat")}</Text>
                </Pressable>
              )}
              {seatId && state?.players.find((player) => player.id === seatId)?.blocked ? null : (
                <Pressable
                  style={styles.cancel}
                  onPress={() => {
                    if (seatId) video.toggleHide(seatId);
                    setSeatId(null);
                  }}
                >
                  <Text style={styles.cancelText}>{seatId && video.hidden.has(seatId) ? t("showVideo") : t("hideVideo")}</Text>
                </Pressable>
              )}
              {seatId ? (
                <SeatSafety
                  credentials={credentials}
                  targetId={seatId}
                  targetName={state?.players.find((player) => player.id === seatId)?.name ?? ""}
                  blocked={state?.players.find((player) => player.id === seatId)?.blocked === true}
                  onClose={() => setSeatId(null)}
                />
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
      <ActionDock
        yourTurn={(hand?.legalActions.length ?? 0) > 0 && state?.paused !== true}
        actions={hand?.legalActions ?? []}
        chipRange={hand?.chipRange ?? null}
        step={game?.bigBlind ?? 1}
        cards={hand?.holeCards ?? []}
        dealDelays={heroDealDelays(Object.values(game.seats).filter((seat) => seat.inHand).length)}
        idleText={state?.paused || game?.round == null ? null : t("waitingTurn")}
        onAction={(action, chips) => act(action, chips)}
      />
      <TableFooter showAd={showAd} />
    </View>
  );
}

const styles = {
  ...tableStyles,
  ...StyleSheet.create({
    statsTable: { gap: 6 },
    statsHead: { borderBottomWidth: 1, borderBottomColor: "rgba(205, 210, 255, 0.16)", paddingBottom: 6 },
    statsCell: { flex: 1, color: "#f7f7fc", fontSize: 16 },
    statsNum: { textAlign: "right", fontVariant: ["tabular-nums"] },
    statsHeadText: { color: "#a6a8b8", fontSize: 13, fontWeight: "700" },
    statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    statsActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    makeAdmin: { color: "#a8b2ff", fontWeight: "800" },
    settingCopy: { flexShrink: 1, gap: 2 },
    settingHint: { color: "#a8a29e", fontSize: 13 },
    stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
    stepperButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(168, 178, 255, 0.12)", alignItems: "center", justifyContent: "center" },
    stepperOff: { opacity: 0.35 },
    stepperText: { color: "#c8ceff", fontSize: 22, lineHeight: 26 },
    stepperValue: { color: "#f7f7fc", fontSize: 16, fontWeight: "800", minWidth: 56, textAlign: "center", fontVariant: ["tabular-nums"] },
    buyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    buyStep: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(168, 178, 255, 0.12)", alignItems: "center", justifyContent: "center" },
    buyStepText: { color: "#c8ceff", fontSize: 28, lineHeight: 32 },
    buyChips: { color: "#f7f7fc", fontSize: 32, fontWeight: "700" },
  }),
};
