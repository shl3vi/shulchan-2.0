import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTableAdAllowed } from "@/ads/placement";
import { useGameSession } from "@/game/GameSession";
import { SeatSafety } from "@/game/SeatSafety";
import { TableHold } from "@/game/TableHold";
import { playSfx } from "@/game/sfx";
import type { Credentials, PublicPlayer } from "@/game/types";
import { DieFace, TrayDie } from "@/games/dice/Die";
import { Scorecard } from "@/games/dice/Scorecard";
import { isFiveKind, LOWER, ROLLS_PER_TURN, scoreFor, totalOf, type Category, type DiceGame, type DicePlayer } from "@/games/dice/scoring";
import { diceView, type DiceView } from "@/games/dice/view";
import { t, type MessageKey } from "@/i18n";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { CameraButton, RoomLight, TableMenu, TalkButton } from "@/table/TableControls";
import { CopyField, ErrorBanner, HomeButton, shareTable, TableFooter, tableError, VideoNotice } from "@/table/TableParts";
import { SeatStrip, type StripSeat } from "@/table/SeatStrip";
import { tableStyles } from "@/table/tableStyles";
import { useBlockedVideo } from "@/table/useBlockedVideo";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

type VideoTrackLike = Parameters<typeof SeatVideo>[0]["track"];

const BOX_LABEL: Record<Category, MessageKey> = {
  ones: "dcOnes",
  twos: "dcTwos",
  threes: "dcThrees",
  fours: "dcFours",
  fives: "dcFives",
  sixes: "dcSixes",
  threeKind: "dcThreeKind",
  fourKind: "dcFourKind",
  fullHouse: "dcFullHouse",
  smallStraight: "dcSmallStraight",
  largeStraight: "dcLargeStraight",
  fiveKind: "dcFiveKind",
  chance: "dcChance",
};

const NO_HOLD = [false, false, false, false, false];
const STRIP_FACES = [6, 6, 6, 6, 6];

/** The video tiles along the top, one per player in the game, or per seated player before it starts. */
function diceSeats({
  lineup,
  seated,
  youId,
  tracks,
  closing,
  started,
  currentId,
  viewedId,
  winners,
  onPick,
  onSeat,
}: {
  lineup: DicePlayer[];
  seated: PublicPlayer[];
  youId?: string;
  tracks: Map<string, VideoTrackLike>;
  closing: ReadonlySet<string>;
  started: boolean;
  currentId?: string;
  viewedId?: string;
  winners: string[];
  onPick: (id: string) => void;
  onSeat: (player: PublicPlayer) => void;
}): StripSeat[] {
  return lineup.map((player) => {
    const seat = seated.find((entry) => entry.id === player.id);
    const track = tracks.get(player.id);
    return {
      id: player.id,
      label: player.id === youId ? t("dcYou") : player.name,
      initialOf: player.name,
      video: track ? <SeatVideo track={track} closing={closing.has(player.id)} /> : undefined,
      badge: started ? String(totalOf(player)) : undefined,
      active: currentId === player.id,
      chosen: viewedId === player.id,
      winner: winners.includes(player.id),
      gone: player.left === true || (started && !seat),
      onPress: started ? () => onPick(player.id) : undefined,
      onLongPress: seat && seat.id !== youId ? () => onSeat(seat) : undefined,
    };
  });
}

/** "Five dice!" bursting over the tray. */
function Burst({ text, burstKey }: { text: string; burstKey: number }) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (burstKey === 0) return;
    pop.setValue(0);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }),
      Animated.delay(900),
      Animated.timing(pop, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [burstKey, pop]);
  if (burstKey === 0) return null;
  const scale = pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0.3, 1, 1.25] });
  const opacity = pop.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[styles.burst, { opacity, transform: [{ scale }, { rotate: "-6deg" }] }]}>
      <Text style={styles.burstText}>{text}</Text>
    </Animated.View>
  );
}

function RollPips({ left }: { left: number }) {
  return (
    <View style={styles.pips}>
      {Array.from({ length: ROLLS_PER_TURN }, (_, index) => (
        <View key={index} style={[styles.rollPip, index < left ? styles.rollPipOn : null]} />
      ))}
    </View>
  );
}

function DiceTable({
  credentials,
  state,
  view,
  emit,
  error,
  errorCode,
  onDismissError,
  onPause,
  onLeave,
}: {
  credentials: Credentials;
  state: NonNullable<ReturnType<typeof useGameSession>["state"]>;
  view: DiceView;
  emit: (event: string, body?: unknown) => void;
  error: string | null;
  errorCode: string | null;
  onDismissError: () => void;
  onPause: (paused: boolean) => void;
  onLeave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const showAd = useTableAdAllowed(null);
  const paused = state.paused === true;
  const isAdmin = state.you?.isAdmin === true;
  const youId = state.you?.id;
  const video = useTableVideo(credentials, paused, "dice");
  useBlockedVideo(video.holdOff, state.players);

  const game = view.play;
  const [held, setHeld] = useState<boolean[]>(NO_HOLD);
  const [rollSent, setRollSent] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [pinned, setPinned] = useState<{ id: string; turn: string } | null>(null);
  const [showing, setShowing] = useState<{ playerId: string; category: Category } | null>(null);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [menuSheet, setMenuSheet] = useState<"info" | "rules" | "log" | null>(null);
  const [seatSheet, setSeatSheet] = useState<PublicPlayer | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const seenLast = useRef("");
  const seenPhase = useRef<string | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = game && game.phase === "playing" ? game.players[game.turn] : undefined;
  const myTurn = !paused && current != null && current.id === youId;
  const inGame = game != null && game.players.some((player) => player.id === youId && !player.left);
  const rolled = game != null && game.rollsLeft < ROLLS_PER_TURN;
  const turnKey = game ? `${game.turn}:${game.players.map((player) => Object.keys(player.scores).length).join(",")}` : "";
  const over = game?.phase === "over";

  // What the server says, adopted as it arrives: the kept dice, the end of a pending roll, a score to call out.
  const adopt = useEffectEvent((next: DiceGame | null) => {
    setRollSent(false);
    setHeld(next?.held ?? NO_HOLD);
    if (!next) return;
    if (seenPhase.current === "playing" && next.phase === "over") playSfx("applause");
    seenPhase.current = next.phase;
    const lastKey = next.last ? `${next.last.playerId}:${next.last.category}:${next.rolls}` : "";
    if (lastKey && lastKey !== seenLast.current) {
      const first = seenLast.current === "";
      seenLast.current = lastKey;
      if (!first && next.last) {
        const who = next.players.find((player) => player.id === next.last!.playerId);
        setSelected(null);
        setShowing({ playerId: next.last.playerId, category: next.last.category });
        setToast(`${who?.id === youId ? t("dcYou") : who?.name ?? ""} +${next.last.points} · ${t(BOX_LABEL[next.last.category])}`);
        playSfx("chip");
        if (showTimer.current) clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setShowing(null), 1700);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2200);
      }
    } else if (!lastKey) {
      seenLast.current = "none";
    }
  });
  // Syncing with the server's game, as the backgammon table does with its board.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    adopt(game);
  }, [game]);

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const lineup: DicePlayer[] = game
    ? game.players
    : [...state.players].sort((a, b) => a.seat - b.seat).slice(0, 6).map((player) => ({ id: player.id, name: player.name, scores: {}, fiveKindBonus: 0 }));
  const watchers = state.players.filter((player) => !lineup.some((entry) => entry.id === player.id));

  const winnerId = over ? game!.winners[0] : undefined;
  const defaultView = showing?.playerId ?? (over ? winnerId : current?.id) ?? youId;
  const viewingId = pinned && pinned.turn === turnKey ? pinned.id : defaultView;
  const viewed = game?.players.find((player) => player.id === viewingId) ?? game?.players.find((player) => player.id === youId) ?? game?.players[0];
  const viewedIsCurrent = viewed != null && current != null && viewed.id === current.id && !showing;
  const preview = viewedIsCurrent && rolled && !rollSent;
  const canScore = myTurn && viewedIsCurrent && rolled && !rollSent;
  const canHold = myTurn && rolled && game!.rollsLeft > 0 && !rollSent;
  const canRoll = myTurn && game!.rollsLeft > 0 && !rollSent && !(rolled && held.every(Boolean));

  const traySize = Math.min(56, Math.floor((Math.min(width, 520) - 32 - 28 - 4 * 12) / 5));

  function send(type: string, body: object = {}) {
    if (paused) return;
    emit("move", { type, ...body });
  }

  function roll() {
    if (!canRoll) return;
    setRollSent(true);
    setSelected(null);
    playSfx("diceClack", 0.9);
    send("roll");
  }

  function toggle(index: number) {
    if (!canHold) return;
    const next = held.map((value, at) => (at === index ? !value : value));
    setHeld(next);
    playSfx("diceClack", 0.25);
    send("hold", { held: next });
  }

  function score() {
    if (!canScore || !selected) return;
    send("score", { category: selected });
    setSelected(null);
  }

  function onLanded() {
    if (game && isFiveKind(game.dice) && game.rollsLeft < ROLLS_PER_TURN) setBurst((value) => value + 1);
  }

  function share() {
    shareTable(credentials.gameId, state.password);
  }

  function restart() {
    if (game?.phase === "playing") setConfirmRestart(true);
    else send("start");
  }


  let status = "";
  if (!game || over) status = "";
  else if (!inGame) status = t("dcWatching");
  else if (myTurn) status = !rolled ? t("dcRollFirst") : game.rollsLeft === 0 ? t("dcPickBox") : t("dcKeepHint");
  else if (current) status = t("dcTheirTurn", { name: current.name });

  const selectedPoints = selected && game && current ? scoreFor(selected, game.dice, current) : 0;
  const ranking = over ? [...game!.players].sort((a, b) => totalOf(b) - totalOf(a)) : [];

  let action: ReactNode = null;
  if (!game || over) {
    const seated = state.players.some((player) => player.id === youId);
    action = seated ? (
      <Pressable style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null, paused ? styles.primaryOff : null]} disabled={paused} onPress={() => send("start")}>
        <Ionicons name={over ? "refresh" : "play"} size={20} color="#1c1917" />
        <Text style={styles.primaryText}>{over ? t("dcPlayAgain") : t("dcStart")}</Text>
      </Pressable>
    ) : null;
  } else if (myTurn && selected) {
    action = (
      <View style={styles.actionRow}>
        <Pressable style={({ pressed }) => [styles.primary, styles.scoreButton, pressed ? styles.pressed : null]} onPress={score}>
          <Text style={styles.primaryText} numberOfLines={1}>
            {t("dcScoreIt", { points: selectedPoints })}
          </Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => setSelected(null)} hitSlop={6}>
          <Ionicons name="close" size={20} color="#c8ceff" />
        </Pressable>
      </View>
    );
  } else if (myTurn) {
    action = (
      <Pressable
        style={({ pressed }) => [styles.primary, !canRoll ? styles.primaryOff : null, pressed && canRoll ? styles.pressed : null]}
        disabled={!canRoll}
        onPress={roll}
      >
        <Ionicons name="cube" size={20} color={canRoll ? "#1c1917" : "#5b5d70"} />
        <Text style={[styles.primaryText, !canRoll ? styles.primaryTextOff : null]}>
          {game.rollsLeft === 0 ? t("dcPickBox") : t("dcRoll")}
        </Text>
        <RollPips left={game.rollsLeft} />
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <RoomLight />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 54 }]}
          showsVerticalScrollIndicator={false}
        >
          <SeatStrip
            width={Math.min(width, 520) - 32}
            maxHeight={106}
            seats={diceSeats({
              lineup,
              seated: state.players,
              youId,
              tracks: video.tracks,
              closing: video.closing,
              started: game != null,
              currentId: current?.id,
              viewedId: game ? viewed?.id : undefined,
              winners: over ? game!.winners : [],
              onPick: (id) => setPinned({ id, turn: turnKey }),
              onSeat: setSeatSheet,
            })}
          />
          {watchers.length > 0 ? (
            <Text style={styles.watchers} numberOfLines={1}>
              {t("dcWatchers", { names: watchers.map((player) => player.name).join(", ") })}
            </Text>
          ) : null}

          {game ? (
            <>
              <View style={styles.tray}>
                <View style={styles.trayRim} pointerEvents="none" />
                {over ? (
                  <View style={styles.podium}>
                    <Ionicons name="trophy" size={30} color="#f6d36b" />
                    <Text style={styles.podiumTitle}>
                      {game.winners.length > 1
                        ? t("dcTie", { points: totalOf(ranking[0]) })
                        : ranking[0]?.id === youId
                          ? t("dcYouWin", { points: totalOf(ranking[0]) })
                          : t("dcWins", { name: ranking[0]?.name ?? "", points: totalOf(ranking[0]) })}
                    </Text>
                    <View style={styles.podiumList}>
                      {ranking.map((player, index) => (
                        <View key={player.id} style={styles.podiumRow}>
                          <Text style={styles.podiumPlace}>{index + 1}</Text>
                          <Text style={styles.podiumName} numberOfLines={1}>{player.id === youId ? t("dcYou") : player.name}</Text>
                          <Text style={styles.podiumTotal}>{totalOf(player)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.diceRow}>
                      {game.dice.map((face, index) => (
                        <TrayDie
                          key={index}
                          index={index}
                          face={face}
                          size={traySize}
                          held={rolled && held[index] === true}
                          rollKey={game.rolls}
                          blank={!rolled}
                          disabled={!canHold}
                          onPress={() => toggle(index)}
                          onLanded={index === 0 ? onLanded : undefined}
                        />
                      ))}
                    </View>
                    <Burst text={t("dcFiveCall")} burstKey={burst} />
                  </>
                )}
              </View>
              {status && action ? <Text style={[styles.status, myTurn ? styles.statusMine : null]}>{status}</Text> : null}
              {viewed ? (
                <View style={styles.cardWrap}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {viewed.id === youId ? t("dcYourCard") : t("dcCardOf", { name: viewed.name })}
                    </Text>
                    {canScore && !selected ? <Text style={styles.cardHint}>{t("dcTapBox")}</Text> : null}
                  </View>
                  <Scorecard
                    player={viewed}
                    dice={game.dice}
                    preview={preview}
                    selectable={canScore}
                    selected={canScore ? selected : null}
                    flashCategory={showing && showing.playerId === viewed.id ? showing.category : null}
                    onSelect={(category) => setSelected((value) => (value === category ? null : category))}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.lobby}>
              <View style={styles.lobbyDice}>
                {STRIP_FACES.map((face, index) => (
                  <View key={index} style={{ transform: [{ rotate: `${(index - 2) * 7}deg` }, { translateY: Math.abs(index - 2) * 4 }] }}>
                    <DieFace face={face} size={44} />
                  </View>
                ))}
              </View>
              <Text style={styles.lobbyTitle}>{t("diceTable")}</Text>
              <Text style={styles.lobbyText}>{t("dcLobbyText")}</Text>
              <View style={styles.lobbyFacts}>
                {(["dcFact1", "dcFact2", "dcFact3"] as const).map((key) => (
                  <View key={key} style={styles.fact}>
                    <Ionicons name="sparkles" size={14} color="#f6d36b" />
                    <Text style={styles.factText}>{t(key)}</Text>
                  </View>
                ))}
              </View>
              {state.players.length < 2 ? (
                <Pressable style={styles.invite} onPress={share}>
                  <Ionicons name="person-add" size={18} color="#c8ceff" />
                  <Text style={styles.inviteText}>{t("dcInvite")}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
        {/* The action sits under the scroll, beside the camera and mic buttons, so nothing covers the card. */}
        <View style={styles.dockBar} pointerEvents="box-none">
          {action ?? (status ? (
            <View style={styles.dockStatus}>
              {current && !myTurn ? <View style={styles.dockDot} /> : null}
              <Text style={styles.dockStatusText} numberOfLines={2}>{status}</Text>
            </View>
          ) : null)}
        </View>
        {toast ? (
          <View style={[styles.toast, { top: insets.top + 8 }]} pointerEvents="none">
            <Text style={styles.toastText} numberOfLines={1}>{toast}</Text>
          </View>
        ) : null}

        <HomeButton />
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("shareTable"), icon: "share", onPress: share },
              { label: t("tableInfo"), icon: "info", onPress: () => setMenuSheet("info") },
              { label: t("rules"), icon: "stats", onPress: () => setMenuSheet("rules") },
              { label: t("winLog"), icon: "stats", onPress: () => setMenuSheet("log") },
              ...(isAdmin
                ? [
                    { label: paused ? t("resumeTable") : t("pauseTable"), icon: "pause" as const, onPress: () => onPause(!paused) },
                    ...(game ? [{ label: t("restartGame"), icon: "restart" as const, onPress: restart }] : []),
                  ]
                : []),
              { label: t("leaveGame"), icon: "leave", danger: true, onPress: onLeave },
            ]}
          />
        </View>

        <Modal visible={menuSheet != null} transparent animationType="fade" onRequestClose={() => setMenuSheet(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMenuSheet(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              {menuSheet === "info" ? (
                <>
                  <Text style={styles.sheetTitle}>{t("tableInfo")}</Text>
                  <CopyField label={t("tableId")} value={credentials.gameId} />
                  {state.password ? <CopyField label={t("password")} value={state.password} /> : null}
                  <Pressable style={styles.cancel} onPress={share}>
                    <Text style={styles.cancelText}>{t("shareTable")}</Text>
                  </Pressable>
                </>
              ) : menuSheet === "rules" ? (
                <>
                  <Text style={styles.sheetTitle}>{t("rules")}</Text>
                  <Text style={styles.statsLine}>{t("dcRules")}</Text>
                  <View style={styles.rulesTable}>
                    {LOWER.map((category) => (
                      <Text key={category} style={styles.rulesLine}>{`${t(BOX_LABEL[category])} — ${t(`${BOX_LABEL[category]}Rule` as MessageKey)}`}</Text>
                    ))}
                  </View>
                  <Pressable style={styles.cancel} onPress={() => setMenuSheet(null)}>
                    <Text style={styles.cancelText}>{t("cancel")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>{t("winLog")}</Text>
                  {view.log.length === 0 ? <Text style={styles.statsLine}>{t("winLogEmpty")}</Text> : [...view.log].reverse().slice(0, 12).map((entry, index) => (
                    <Text key={index} style={styles.statsLine}>
                      {entry.scores.map((line) => `${line.name} ${line.total}`).join(" · ")}
                    </Text>
                  ))}
                  <Pressable style={styles.cancel} onPress={() => setMenuSheet(null)}>
                    <Text style={styles.cancelText}>{t("cancel")}</Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={seatSheet != null} transparent animationType="fade" onRequestClose={() => setSeatSheet(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSeatSheet(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              {seatSheet ? (
                <>
                  <Text style={styles.sheetTitle}>{seatSheet.name}</Text>
                  {seatSheet.blocked ? null : (
                    <>
                      <Pressable style={styles.cancel} onPress={() => { video.toggleMute(seatSheet.id); setSeatSheet(null); }}>
                        <Text style={styles.cancelText}>{video.muted.has(seatSheet.id) ? t("unmuteSeat") : t("muteSeat")}</Text>
                      </Pressable>
                      <Pressable style={styles.cancel} onPress={() => { video.toggleHide(seatSheet.id); setSeatSheet(null); }}>
                        <Text style={styles.cancelText}>{video.hidden.has(seatSheet.id) ? t("showVideo") : t("hideVideo")}</Text>
                      </Pressable>
                    </>
                  )}
                  <SeatSafety
                    credentials={credentials}
                    targetId={seatSheet.id}
                    targetName={seatSheet.name}
                    blocked={seatSheet.blocked === true}
                    onClose={() => setSeatSheet(null)}
                  />
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <ConfirmDialog
          visible={confirmRestart}
          title={t("restartGame")}
          message={t("restartSure")}
          dismissLabel={t("cancel")}
          onDismiss={() => setConfirmRestart(false)}
          confirmLabel={t("restartYes")}
          confirmTone="danger"
          onConfirm={() => {
            setConfirmRestart(false);
            send("start");
          }}
        />
        <TableHold top={insets.top + 56} paused={paused} idleCloseAt={state.idleCloseAt} serverNow={state.serverNow} isAdmin={isAdmin} onPause={onPause} />
        {error ? <ErrorBanner message={tableError(error, errorCode)} onClose={onDismissError} /> : null}
        {video.videoNotice ? <VideoNotice message={video.videoNotice} onClose={video.dismissVideoNotice} /> : null}
        <CameraButton on={video.cameraOn} held={paused} onToggle={video.setCamera} />
        <TalkButton on={video.micOn} onTalk={video.setMic} />
      </View>
      <TableFooter showAd={showAd} />
    </View>
  );
}

export function DiceScreen({ credentials }: { credentials: Credentials }) {
  const router = useRouter();
  const { state, error, errorCode, dismissError, setPaused, leave, emit } = useGameSession();
  const view = diceView(state);
  if (!state || !view) return <View style={styles.screen} />;
  return (
    <DiceTable
      credentials={credentials}
      state={state}
      view={view}
      emit={emit}
      error={error}
      errorCode={errorCode}
      onDismissError={dismissError}
      onPause={setPaused}
      onLeave={() => {
        void leave().then(() => router.dismissTo("/"));
      }}
    />
  );
}

const styles = {
  ...tableStyles,
  ...StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 8, gap: 10, alignSelf: "center", width: "100%", maxWidth: 520 },
    strip: { gap: 10, paddingHorizontal: 2, paddingVertical: 2, flexGrow: 1, justifyContent: "center" },
    chip: { width: 60, alignItems: "center", gap: 4 },
    chipGone: { opacity: 0.4 },
    chipCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: "rgba(246,211,107,0.55)",
      backgroundColor: "#1c1917",
      backgroundImage: "linear-gradient(180deg, #2c2724 0%, #1c1917 55%, #121010 100%)",
      alignItems: "center",
      justifyContent: "center",
    },
    chipActive: { borderWidth: 3, borderColor: "#86e3c4", boxShadow: "0 0 14px rgba(134,227,196,0.55)" },
    chipWinner: { borderColor: "#f6d36b", boxShadow: "0 0 16px rgba(246,211,107,0.6)" },
    chipClip: { width: "100%", height: "100%", borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    chipInitial: { color: "#fafaf9", fontSize: 20, fontWeight: "800" },
    crown: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#f6d36b",
      alignItems: "center",
      justifyContent: "center",
    },
    chipName: { color: "#a6a8c8", fontSize: 12, fontWeight: "700", maxWidth: 60 },
    chipNameBelowScore: { marginTop: 6 },
    chipNameOn: { color: "#f7f7fc" },
    chipScore: {
      position: "absolute",
      bottom: -9,
      alignSelf: "center",
      minWidth: 32,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 8,
      backgroundColor: "#1d2038",
      borderWidth: 1,
      borderColor: "rgba(200,206,255,0.25)",
    },
    chipScoreOn: { backgroundColor: "#c8ceff", borderColor: "#c8ceff" },
    chipScoreText: { color: "#c8ceff", fontSize: 12, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
    chipScoreTextOn: { color: "#171b35" },
    watchers: { color: "#73758b", fontSize: 12, textAlign: "center", marginTop: -4 },
    tray: {
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 16,
      paddingBottom: 6,
      backgroundColor: "#0f3a31",
      backgroundImage: "radial-gradient(ellipse at 50% 30%, #1d6b58 0%, #124638 55%, #0b2c25 100%)",
      borderWidth: 3,
      borderColor: "#6b4a26",
      boxShadow: "inset 0 6px 18px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.5)",
      justifyContent: "center",
      overflow: "hidden",
    },
    trayRim: {
      position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: "rgba(246,211,107,0.28)",
    },
    diceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    burst: { position: "absolute", left: 0, right: 0, top: 34, alignItems: "center" },
    burstText: {
      color: "#f6d36b",
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: 1,
      textShadowColor: "rgba(0,0,0,0.65)",
      textShadowOffset: { width: 0, height: 3 },
      textShadowRadius: 8,
    },
    podium: { alignItems: "center", gap: 8, paddingBottom: 6 },
    podiumTitle: { color: "#f7f7fc", fontSize: 20, fontWeight: "900", textAlign: "center" },
    podiumList: { alignSelf: "stretch", gap: 4 },
    podiumRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.22)" },
    podiumPlace: { color: "#f6d36b", fontWeight: "900", width: 16, textAlign: "center" },
    podiumName: { color: "#f7f7fc", fontWeight: "800", flex: 1 },
    podiumTotal: { color: "#f7f7fc", fontWeight: "900", fontVariant: ["tabular-nums"] },
    status: { color: "#a6a8c8", fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: -2 },
    statusMine: { color: "#86e3c4" },
    cardWrap: { gap: 6 },
    cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 6 },
    cardTitle: { color: "#c8ceff", fontSize: 13, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", flexShrink: 1 },
    cardHint: { color: "#f6d36b", fontSize: 12, fontWeight: "700" },
    lobby: {
      marginTop: 8,
      alignItems: "center",
      gap: 12,
      padding: 22,
      borderRadius: 26,
      backgroundColor: "rgba(20, 23, 42, 0.86)",
      borderWidth: 1,
      borderColor: "rgba(205, 210, 255, 0.16)",
    },
    lobbyDice: { flexDirection: "row", gap: 6, marginBottom: 6 },
    lobbyTitle: { color: "#f7f7fc", fontSize: 26, fontWeight: "900" },
    lobbyText: { color: "#a6a8c8", fontSize: 15, textAlign: "center", lineHeight: 21 },
    lobbyFacts: { alignSelf: "stretch", gap: 8, marginTop: 4 },
    fact: { flexDirection: "row", alignItems: "center", gap: 8 },
    factText: { color: "#dfe2ff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
    invite: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: "rgba(168, 178, 255, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(168, 178, 255, 0.28)",
    },
    inviteText: { color: "#f7f7fc", fontWeight: "800" },
    dockStatus: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6 },
    dockDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#86e3c4", boxShadow: "0 0 10px rgba(134,227,196,0.8)" },
    dockStatusText: { color: "#dfe2ff", fontSize: 15, fontWeight: "800", flexShrink: 1 },
    dockBar: { height: 84, paddingLeft: 16, paddingRight: 144, justifyContent: "center" },
    actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    primary: {
      height: 52,
      borderRadius: 26,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: "#f6d36b",
      backgroundImage: "linear-gradient(180deg, #ffe28c 0%, #f6d36b 50%, #d9ae3e 100%)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6)",
    },
    scoreButton: {
      flex: 1,
      backgroundColor: "#86e3c4",
      backgroundImage: "linear-gradient(180deg, #a6f0d6 0%, #86e3c4 50%, #5cc6a3 100%)",
    },
    primaryOff: { backgroundColor: "#2a2d44", backgroundImage: "none", boxShadow: "none" },
    pressed: { transform: [{ scale: 0.97 }] },
    primaryText: { color: "#1c1917", fontSize: 17, fontWeight: "900", flexShrink: 1 },
    primaryTextOff: { color: "#8b8da3" },
    ghost: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(20,23,42,0.9)",
      borderWidth: 1,
      borderColor: "rgba(168,178,255,0.35)",
    },
    pips: { flexDirection: "row", gap: 4 },
    rollPip: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(28,25,23,0.22)" },
    rollPipOn: { backgroundColor: "#1c1917" },
    toast: {
      position: "absolute",
      left: 64,
      right: 64,
      zIndex: 9,
      alignItems: "center",
    },
    toastText: {
      color: "#1c1917",
      backgroundColor: "#f6d36b",
      overflow: "hidden",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontWeight: "900",
      fontSize: 14,
    },
    rulesTable: { gap: 4 },
    rulesLine: { color: "#dfe2ff", fontSize: 13, lineHeight: 18 },
  }),
};
