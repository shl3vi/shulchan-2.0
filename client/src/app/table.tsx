import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, Easing, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdBanner } from "@/ads/AdBanner";
import { tableAdAllowed } from "@/ads/placement";
import { useGameSession } from "@/game/GameSession";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { ActionDock, PokerTableLayout, TableMenu, TalkButton, type SeatSlot } from "@/game/PokerTableLayout";
import type { Card, TableSnapshot } from "@/game/types";
import { API_URL } from "@/game/api";
import { BackgammonBoard, DiceCup } from "@/game/BackgammonBoard";
import { answerDouble, move as playMove, newGame, opponent, roll, type Color, type Game, type Move } from "@/game/backgammon";
import { checkerPlace } from "@/game/diceSound";
import { t } from "@/i18n";

function WinnerSparkles() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View pointerEvents="none" style={[styles.sparkOrbit, { transform: [{ rotate }] }]}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <Text
            key={index}
            style={[
              styles.spark,
              { left: 72 + Math.cos(angle) * 64, top: 72 + Math.sin(angle) * 64 },
            ]}
          >
            ✦
          </Text>
        );
      })}
    </Animated.View>
  );
}

function PlayerCircle({ name, video, nameAbove, celebrate }: { name: string; video?: ReactNode; nameAbove?: boolean; celebrate?: boolean }) {
  const shown = name || t("openSeat");
  const label = (
    <Text style={styles.playerName} numberOfLines={1}>
      {shown}
    </Text>
  );
  const initial = name ? name.replace(/\D/g, "").slice(0, 1) || name.slice(0, 1) : "+";
  const circle = <View style={styles.circle}>{video ?? <Text style={styles.initial}>{initial}</Text>}</View>;
  return (
    <View style={styles.player}>
      {nameAbove ? label : null}
      <View style={styles.circleWrap}>
        {celebrate ? <WinnerSparkles /> : null}
        {circle}
      </View>
      {nameAbove ? null : label}
    </View>
  );
}

function BackgammonTable({
  topVideo,
  bottomVideo,
  youName,
  otherName,
  otherId,
  micOn,
  cameraOn,
  setMic,
  setCamera,
  otherMuted,
  otherHidden,
  onMuteOther,
  onHideOther,
  gameId,
  password,
  onLeave,
  isAdmin,
  myColor,
  serverGame,
  wins,
  emit,
  subscribe,
}: {
  topVideo?: ReactNode;
  bottomVideo?: ReactNode;
  youName: string;
  otherName: string;
  otherId?: string;
  micOn: boolean;
  cameraOn: boolean;
  setMic: (on: boolean) => void;
  setCamera: (on: boolean) => void;
  otherMuted: boolean;
  otherHidden: boolean;
  onMuteOther: () => void;
  onHideOther: () => void;
  gameId?: string;
  password?: string;
  onLeave: () => void;
  isAdmin: boolean;
  myColor: Color | null;
  serverGame?: unknown;
  wins?: TableSnapshot["backgammonLog"];
  emit: (event: string, body: unknown) => void;
  subscribe: (event: string, handler: (body: unknown) => void) => () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState(false);
  const [rules, setRules] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [seat, setSeat] = useState(false);
  const [game, setGame] = useState<Game>(() => newGame());
  const [selected, setSelected] = useState<number | "bar" | null>(null);
  const [rolling, setRolling] = useState(false);
  const [cupFaces, setCupFaces] = useState<number[]>([]);
  const pendingRoll = useRef<Game | null>(null);
  const waiting = otherId == null;
  const actor: Color | null = waiting || game.phase === "over" ? null : game.phase === "offer" ? opponent(game.turn) : game.turn;
  const iPlay = !waiting && myColor != null && actor === myColor;
  const actorName = actor == null ? "" : actor === myColor ? youName : otherName;
  const winnerName = game.winner == null ? "" : game.winner === myColor ? youName : otherName;
  const won = game.phase === "over" && game.winner != null;

  function restartGame() {
    const go = () => update(newGame());
    const inPlay = game.phase === "roll" || game.phase === "move" || game.phase === "offer";
    if (!inPlay) {
      go();
      return;
    }
    Alert.alert(t("restartGame"), t("restartSure"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("restartYes"), style: "destructive", onPress: go },
    ]);
  }

  function shareTable() {
    const link = gameId ? `${gameId}${password ? ` · ${password}` : ""}` : "backgammon";
    Share.share({ message: t("shareMessage", { link }) });
  }

  function update(next: Game) {
    setSelected(null);
    setGame(next);
    emit("bg", next);
  }

  useEffect(() => {
    if (!serverGame || typeof serverGame !== "object") return;
    setSelected(null);
    setGame(serverGame as Game);
  }, [serverGame]);

  const recorded = useRef(false);
  useEffect(() => {
    if (!won || recorded.current || wins == null || wins.length > 0) return;
    recorded.current = true;
    emit("bg", game);
  }, [won, wins, game, emit]);

  useEffect(() => {
    return subscribe("bg", (body) => {
      if (!body || typeof body !== "object") return;
      setSelected(null);
      setGame(body as Game);
    });
  }, [subscribe]);

  function onMove(chosen: Move) {
    const next = playMove(game, chosen);
    if (next === game) return;
    checkerPlace();
    update(next);
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <View style={[styles.bgColumn, { paddingTop: insets.top + 52 }]}>
          <View style={[styles.seatRow, ((actor != null && actor !== myColor) || (won && game.winner !== myColor)) && styles.seatOn]}>
            <Pressable disabled={!otherId} onPress={() => setSeat(true)}>
              <PlayerCircle name={otherName} video={topVideo} celebrate={won && game.winner !== myColor} />
            </Pressable>
          </View>
          <View style={styles.boardAnchor}>
            <BackgammonBoard game={game} selected={selected} enabled={iPlay} bare={waiting} onShare={shareTable} onSelect={setSelected} onMove={onMove} onAgain={won ? () => update(newGame()) : undefined} />
            {won || waiting ? null : <View style={styles.diceCup}>
              <DiceCup
                faces={rolling ? cupFaces : game.shown}
                rolling={rolling}
                prompt={iPlay && !rolling && (game.phase === "opening" || game.phase === "roll")}
                onRoll={iPlay && !rolling && (game.phase === "opening" || game.phase === "roll") ? () => {
                  const next = roll(game);
                  pendingRoll.current = next;
                  const openingDie = game.phase === "opening"
                    ? next.shown.length === 2 ? next.shown[1] : next.dice[0] ?? next.shown[0]
                    : undefined;
                  setCupFaces(openingDie != null ? [openingDie] : next.shown);
                  setRolling(true);
                } : undefined}
                onDone={() => {
                  const next = pendingRoll.current;
                  pendingRoll.current = null;
                  setRolling(false);
                  if (next) update(next);
                }}
              />
            </View>}
            {won ? (
              <Text style={styles.winCaption}>
                {t("bgWon", { name: winnerName, color: t(game.winner === "white" ? "bgLight" : "bgDark"), points: game.score })}
              </Text>
            ) : null}
            {won || waiting ? null : <View style={styles.tools}>
            {iPlay && game.phase === "offer" ? (
              <>
                <Pressable style={styles.tool} onPress={() => update(answerDouble(game, true))}>
                  <Text style={styles.toolText}>{t("takeDouble")}</Text>
                </Pressable>
                <Pressable style={styles.tool} onPress={() => update(answerDouble(game, false))}>
                  <Text style={styles.toolText}>{t("passDouble")}</Text>
                </Pressable>
              </>
            ) : null}
            <Text style={styles.turnLabel}>{actorName ? t("bgTurn", { name: actorName }) : ""}</Text>
            </View>}
          </View>
          <View style={[styles.seatRow, ((actor != null && actor === myColor) || (won && game.winner === myColor)) && styles.seatOn]}>
            <PlayerCircle name={youName} video={bottomVideo} nameAbove celebrate={won && game.winner === myColor} />
          </View>
        </View>
        <Pressable style={[styles.home, { top: insets.top + 8 }]} onPress={() => router.replace("/")} hitSlop={8}>
          <Ionicons name="home" size={20} color="#fafaf9" />
        </Pressable>
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("tableInfo"), icon: "info", onPress: () => setInfo(true) },
              { label: t("rules"), icon: "stats", onPress: () => setRules(true) },
              { label: t("winLog"), icon: "stats", onPress: () => setLogOpen(true) },
              ...(isAdmin ? [{ label: t("restartGame"), icon: "restart" as const, onPress: restartGame }] : []),
              { label: t("shareTable"), icon: "share", onPress: shareTable },
              {
                label: t("leaveGame"),
                icon: "leave",
                danger: true,
                onPress: onLeave,
              },
            ]}
          />
        </View>
        <Modal visible={logOpen} transparent animationType="fade" onRequestClose={() => setLogOpen(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setLogOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t("winLog")}</Text>
              {(wins ?? []).length === 0 ? <Text style={styles.statsLine}>{t("winLogEmpty")}</Text> : (wins ?? []).map((entry, index) => {
                const winnerName = entry.winner === "white" ? entry.whiteName : entry.blackName;
                return (
                  <Text key={`${index}-${entry.points}`} style={styles.statsLine}>
                    {`${entry.whiteName} (${t("bgLight")}), ${entry.blackName} (${t("bgDark")}), ${winnerName}, ${entry.points}`}
                  </Text>
                );
              })}
              <Pressable style={styles.cancel} onPress={() => setLogOpen(false)}>
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={rules} transparent animationType="fade" onRequestClose={() => setRules(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setRules(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t("rules")}</Text>
              <Text style={styles.statsLine}>{t("bgRules")}</Text>
              <Pressable style={styles.cancel} onPress={() => setRules(false)}>
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={info} transparent animationType="fade" onRequestClose={() => setInfo(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setInfo(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t("tableInfo")}</Text>
              {gameId ? <CopyField label={t("tableId")} value={gameId} /> : <Text style={styles.statsLine}>backgammon</Text>}
              {password ? <CopyField label={t("password")} value={password} /> : null}
              <Pressable style={styles.cancel} onPress={shareTable}>
                <Text style={styles.cancelText}>{t("shareTable")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={seat} transparent animationType="fade" onRequestClose={() => setSeat(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSeat(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{otherName}</Text>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  onMuteOther();
                  setSeat(false);
                }}
              >
                <Text style={styles.cancelText}>{otherMuted ? t("unmuteSeat") : t("muteSeat")}</Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  onHideOther();
                  setSeat(false);
                }}
              >
                <Text style={styles.cancelText}>{otherHidden ? t("showVideo") : t("hideVideo")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        {Platform.OS !== "web" ? (
          <Pressable style={[styles.cameraToggle, cameraOn && styles.cameraToggleOn]} onPress={() => setCamera(!cameraOn)}>
            <Ionicons name={cameraOn ? "videocam" : "videocam-off"} size={22} color={cameraOn ? "#1c1917" : "#fafaf9"} />
          </Pressable>
        ) : null}
        {Platform.OS !== "web" ? <TalkButton on={micOn} onTalk={setMic} /> : null}
      </View>
      <View style={{ paddingBottom: insets.bottom, backgroundColor: "#0c0a09" }}>
        <View style={styles.ad}>{tableAdAllowed(null) ? <AdBanner /> : null}</View>
      </View>
    </View>
  );
}

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
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const insets = useSafeAreaInsets();
  const { credentials, state, error, dismissError, startHand, act, leave, removePlayer, transferAdmin, rebuy, emit, subscribe } = useGameSession();
  const video = useTableVideo(credentials);
  const [sheet, setSheet] = useState<"stats" | "admin" | null>(null);
  const [info, setInfo] = useState(false);
  const [buying, setBuying] = useState(false);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [buyChips, setBuyChips] = useState(0);
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const you = state?.you;
  const pot = state?.pots.reduce((sum, entry) => sum + entry.size, 0) ?? 0;
  const buyStep = Math.max(1, state?.bigBlind ?? 1);

  useEffect(() => {
    setSeatId(null);
  }, [credentials?.playerId]);

  function stopBuy() {
    if (holdStart.current) clearTimeout(holdStart.current);
    if (hold.current) clearInterval(hold.current);
    holdStart.current = null;
    hold.current = null;
  }

  function startBuy(direction: -1 | 1) {
    stopBuy();
    const cap = state?.buyIn ?? buyStep;
    setBuyChips((value) => Math.min(cap, Math.max(1, value + direction * buyStep)));
    holdStart.current = setTimeout(() => {
      hold.current = setInterval(() => setBuyChips((value) => Math.min(cap, Math.max(1, value + direction * buyStep))), 70);
    }, 320);
  }

  if (kind === "backgammon" || state?.kind === "backgammon") {
    const youId = you?.id;
    const other = state?.players.find((player) => player.id !== youId);
    const topTrack = other ? video.tracks.get(other.id) : undefined;
    const bottomTrack = youId ? video.tracks.get(youId) : undefined;
    const ordered = [...(state?.players ?? [])].sort((a, b) => a.seat - b.seat);
    const mineIndex = ordered.findIndex((player) => player.id === youId);
    const myColor: Color | null = mineIndex === 0 ? "white" : mineIndex === 1 ? "black" : null;
    return (
      <BackgammonTable
        topVideo={topTrack ? <SeatVideo track={topTrack} /> : undefined}
        bottomVideo={bottomTrack ? <SeatVideo track={bottomTrack} /> : undefined}
        youName={ordered.find((player) => player.id === youId)?.name ?? ""}
        otherName={other?.name ?? ""}
        otherId={other?.id}
        myColor={myColor}
        serverGame={state?.backgammon}
        wins={state?.backgammonLog}
        emit={emit}
        subscribe={subscribe}
        micOn={video.micOn}
        cameraOn={video.cameraOn}
        setMic={video.setMic}
        setCamera={video.setCamera}
        otherMuted={other ? video.muted.has(other.id) : false}
        otherHidden={other ? video.hidden.has(other.id) : false}
        onMuteOther={() => {
          if (other) video.toggleMute(other.id);
        }}
        onHideOther={() => {
          if (other) video.toggleHide(other.id);
        }}
        gameId={credentials?.gameId}
        password={state?.password}
        isAdmin={state?.you?.isAdmin === true}
        onLeave={() => {
          void leave().then(() => router.replace("/"));
        }}
      />
    );
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
      id: player.id,
      name: player.name,
      stack: player.stack,
      bet: player.betSize,
      toAct: state?.playerToActId === player.id,
      isYou,
      winner: winnerSeats.has(player.seat),
      video: track ? <SeatVideo track={track} /> : undefined,
      cameraOn: isYou ? video.cameraOn : track != null,
    };
  }

  const gameId = credentials.gameId;
  function shareTable() {
    const link = `${API_URL}/join?${new URLSearchParams({
      game: gameId,
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
                        <Text style={[styles.statsCell, styles.statsNum]}>{player.stack}</Text>
                        <Text style={[styles.statsCell, styles.statsNum]}>{player.bought ?? 0}</Text>
                      </View>
                    ))}
                    <Text style={styles.statsLine}>{t("pot", { n: pot })}</Text>
                  </View>
                )
              ) : (
                <>
                  {(state?.players ?? []).length === 0 ? <Text style={styles.statsLine}>{t("noPlayers")}</Text> : null}
                  {(state?.players ?? []).map((player) => (
                    <View key={player.id} style={styles.statsRow}>
                      <Text style={styles.statsLine}>{player.name}</Text>
                      {player.id !== you?.id ? (
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
                : error === "At least two players need chips to deal."
                  ? t("needTwoWithMoney")
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
        {Platform.OS !== "web" ? (
          <Pressable style={[styles.cameraToggle, video.cameraOn && styles.cameraToggleOn]} onPress={() => video.setCamera(!video.cameraOn)}>
            <Ionicons name={video.cameraOn ? "videocam" : "videocam-off"} size={22} color={video.cameraOn ? "#1c1917" : "#fafaf9"} />
          </Pressable>
        ) : null}
        {Platform.OS !== "web" ? <TalkButton on={video.micOn} onTalk={video.setMic} /> : null}
        <Modal visible={seatId != null} transparent animationType="fade" onRequestClose={() => setSeatId(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSeatId(null)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{state?.players.find((player) => player.id === seatId)?.name}</Text>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  if (seatId) video.toggleMute(seatId);
                  setSeatId(null);
                }}
              >
                <Text style={styles.cancelText}>{seatId && video.muted.has(seatId) ? t("unmuteSeat") : t("muteSeat")}</Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={() => {
                  if (seatId) video.toggleHide(seatId);
                  setSeatId(null);
                }}
              >
                <Text style={styles.cancelText}>{seatId && video.hidden.has(seatId) ? t("showVideo") : t("hideVideo")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
      <ActionDock
        yourTurn={(you?.legalActions.length ?? 0) > 0}
        actions={you?.legalActions ?? []}
        chipRange={you?.chipRange ?? null}
        step={state?.bigBlind ?? 1}
        cards={you?.holeCards ?? []}
        idleText={state?.round == null ? null : t("waitingTurn")}
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
  players: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingBottom: 28 },
  player: { alignItems: "center", gap: 8, maxWidth: 160 },
  bgColumn: { flex: 1, justifyContent: "space-between", paddingBottom: 64 },
  seatRow: { alignItems: "center", opacity: 0.55 },
  seatOn: { opacity: 1 },
  tools: {
    position: "absolute",
    left: 8,
    right: 96,
    bottom: -64,
    height: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  tool: { backgroundColor: "#f6d36b", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  toolText: { color: "#1c1917", fontWeight: "900" },
  turnLabel: { color: "#f6d36b", fontWeight: "800" },
  circleWrap: { width: 76, height: 76, alignItems: "center", justifyContent: "center" },
  sparkOrbit: { position: "absolute", width: 160, height: 160, left: -32, top: -32 },
  spark: { position: "absolute", color: "#f6d36b", fontSize: 16, fontWeight: "900" },
  winCaption: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: -36,
    color: "#f6d36b",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
  },
  circle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#f6d36b",
    backgroundColor: "#1c1917",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { color: "#fafaf9", fontSize: 40, fontWeight: "800" },
  playerName: { color: "#fafaf9", fontSize: 16, fontWeight: "800" },
  meta: { color: "#d6d3d1", padding: 24 },
  stage: { flex: 1, minHeight: 0 },
  boardAnchor: { position: "relative" },
  diceCup: { position: "absolute", right: 10, bottom: -94, zIndex: 4 },
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
  statsTable: { gap: 6 },
  statsHead: { borderBottomWidth: 1, borderBottomColor: "#44403c", paddingBottom: 6 },
  statsCell: { flex: 1, color: "#fafaf9", fontSize: 16 },
  statsNum: { textAlign: "right", fontVariant: ["tabular-nums"] },
  statsHeadText: { color: "#a8a29e", fontSize: 13, fontWeight: "700" },
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
  cameraToggle: {
    position: "absolute",
    right: 76,
    bottom: 16,
    zIndex: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1c1917",
    borderWidth: 1,
    borderColor: "#44403c",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraToggleOn: { backgroundColor: "#f6d36b", borderColor: "#f6d36b" },
});
