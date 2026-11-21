import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTableAdAllowed } from "@/ads/placement";
import { useGameSession } from "@/game/GameSession";
import { SeatSafety } from "@/game/SeatSafety";
import { TableHold } from "@/game/TableHold";
import { playSfx } from "@/game/sfx";
import type { Credentials } from "@/game/types";
import { backgammonView, type BackgammonView } from "@/games/backgammon/view";
import { BackgammonBoard, DiceCup } from "@/games/backgammon/BackgammonBoard";
import { checkerPlace } from "@/games/backgammon/diceSound";
import { move as playMove, newGame, opponent, seenMove, type BackgammonAction, type Color, type Game, type Move } from "@/games/backgammon/rules";
import { t, type MessageKey } from "@/i18n";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { CameraButton, RoomLight, TableMenu, TalkButton } from "@/table/TableControls";
import { CopyField, ErrorBanner, HomeButton, PlayerCircle, shareTable, TableFooter, tableError, VideoNotice } from "@/table/TableParts";
import { tableStyles } from "@/table/tableStyles";
import { useBlockedVideo } from "@/table/useBlockedVideo";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

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
  otherBlocked,
  onMuteOther,
  onHideOther,
  credentials,
  gameId,
  password,
  onLeave,
  videoNotice,
  onDismissVideo,
  isAdmin,
  paused,
  idleCloseAt,
  serverNow,
  onPause,
  error,
  errorCode,
  onDismissError,
  myColor,
  serverGame,
  wins,
  emit,
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
  otherBlocked: boolean;
  onMuteOther: () => void;
  onHideOther: () => void;
  credentials: Credentials;
  gameId: string;
  password?: string;
  onLeave: () => void;
  videoNotice?: MessageKey | null;
  onDismissVideo?: () => void;
  isAdmin: boolean;
  paused: boolean;
  idleCloseAt?: number;
  serverNow?: number;
  onPause: (paused: boolean) => void;
  error: string | null;
  errorCode: string | null;
  onDismissError: () => void;
  myColor: Color | null;
  serverGame?: unknown;
  wins?: BackgammonView["log"];
  emit: (event: string, body: unknown) => void;
}) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState(false);
  const [rules, setRules] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [seat, setSeat] = useState(false);
  const [game, setGame] = useState<Game>(() => newGame());
  const [selected, setSelected] = useState<number | "bar" | null>(null);
  const [rolling, setRolling] = useState(false);
  const [cupFaces, setCupFaces] = useState<number[]>([]);
  const [rollSent, setRollSent] = useState(false);
  const showAd = useTableAdAllowed(null);
  const waiting = otherId == null;
  const actor: Color | null = waiting || game.phase === "over" ? null : game.phase === "offer" ? opponent(game.turn) : game.turn;
  const gameRef = useRef(game);
  gameRef.current = game;
  const seenGame = useRef("");

  const iPlay = !paused && !waiting && myColor != null && actor === myColor;
  const winnerName = game.winner == null ? "" : game.winner === myColor ? youName : otherName;
  const won = game.phase === "over" && game.winner != null;

  function restartGame() {
    const go = () => send({ type: "restart" });
    const inPlay = game.phase === "roll" || game.phase === "move" || game.phase === "offer";
    if (!inPlay) {
      go();
      return;
    }
    setConfirmRestart(true);
  }

  function share() {
    shareTable(gameId, password);
  }

  function gameKey(next: Game) {
    return JSON.stringify({
      points: next.points,
      bar: next.bar,
      off: next.off,
      shown: next.shown,
      dice: next.dice,
      phase: next.phase,
      turn: next.turn,
      winner: next.winner,
      cube: next.cube,
      cubeOwner: next.cubeOwner,
      score: next.score,
      message: next.message,
      rolls: next.rolls ?? 0,
    });
  }

  function adopt(next: Game, remote: boolean) {
    // Any board from the server, even an unchanged one after a refused roll, answers the pending roll.
    setRollSent(false);
    const key = gameKey(next);
    if (key === seenGame.current) return;
    const prev = gameRef.current;
    const first = seenGame.current === "";
    seenGame.current = key;
    setSelected(null);
    setGame(next);
    if (!first && next.phase === "over" && prev.phase !== "over" && next.winner != null) playSfx("applause");
    if (!remote || first) return;
    const rolled = (next.rolls ?? 0) !== (prev.rolls ?? 0) && (next.lastRoll?.length ?? 0) > 0;
    const moved =
      JSON.stringify(prev.points) !== JSON.stringify(next.points)
      || JSON.stringify(prev.bar) !== JSON.stringify(next.bar)
      || JSON.stringify(prev.off) !== JSON.stringify(next.off);
    if (rolled && !rolling) {
      setCupFaces(next.lastRoll!.slice());
      setRolling(true);
    }
    // A single move slides on the board, which plays its sound when it lands (onLand below).
    if (moved && !seenMove(prev, next)) checkerPlace();
  }

  function send(action: BackgammonAction) {
    if (paused) return;
    emit("move", action);
  }

  // A new board from the server is adopted with the latest local state (selection, pending roll),
  // and plays its sounds. That is syncing with the server, so it belongs in an effect.
  const adoptRemote = useEffectEvent((next: Game) => adopt(next, true));
  useEffect(() => {
    if (!serverGame || typeof serverGame !== "object") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    adoptRemote(serverGame as Game);
  }, [serverGame]);

  function onMove(chosen: Move) {
    if (paused) return;
    const next = playMove(game, chosen);
    if (next === game) return;
    adopt(next, false);
    send({ type: "move", ...chosen });
  }

  function seatAttention(actorColor: Color | null, mine: Color | null, self: boolean): "roll" | "play" | null {
    if (waiting || won || actorColor == null || mine == null) return null;
    const active = self ? actorColor === mine : actorColor !== mine;
    if (!active) return null;
    if (game.phase === "roll" || game.phase === "opening") return "roll";
    if (game.phase === "move") return "play";
    return null;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <RoomLight />
        <View style={[styles.bgColumn, { paddingTop: insets.top + 52 }]}>
          <View style={[styles.seatRow, ((actor != null && actor !== myColor) || (won && game.winner !== myColor)) && styles.seatOn]}>
            <Pressable disabled={!otherId} onPress={() => setSeat(true)}>
              <PlayerCircle
                name={otherName}
                video={topVideo}
                celebrate={won && game.winner !== myColor}
                attention={seatAttention(actor, myColor, false)}
              />
            </Pressable>
          </View>
          <View style={styles.boardAnchor}>
            <BackgammonBoard game={game} perspective={myColor} selected={selected} enabled={iPlay} bare={waiting} onShare={share} onSelect={setSelected} onMove={onMove} onLand={(kind) => (kind === "hit" ? playSfx("checkerHit") : checkerPlace())} onAgain={won && !paused ? () => send({ type: "restart" }) : undefined} />
            {won || waiting ? null : <View style={styles.diceCup}>
              <DiceCup
                faces={rolling ? cupFaces : game.shown}
                rolling={rolling}
                prompt={iPlay && !rolling && !rollSent && (game.phase === "opening" || game.phase === "roll")}
                onRoll={iPlay && !rolling && !rollSent && (game.phase === "opening" || game.phase === "roll") ? () => {
                  setRollSent(true);
                  send({ type: "roll" });
                } : undefined}
                onDone={() => setRolling(false)}
              />
            </View>}
            {won ? (
              <Text style={styles.winCaption}>
                {t("bgWon", { name: winnerName, color: t(game.winner === "white" ? "bgLight" : "bgDark"), points: game.score })}
              </Text>
            ) : null}
            {won || waiting || !iPlay || game.phase !== "offer" ? null : <View style={styles.tools}>
              <Pressable style={styles.tool} onPress={() => send({ type: "answer", accept: true })}>
                <Text style={styles.toolText}>{t("takeDouble")}</Text>
              </Pressable>
              <Pressable style={styles.tool} onPress={() => send({ type: "answer", accept: false })}>
                <Text style={styles.toolText}>{t("passDouble")}</Text>
              </Pressable>
            </View>}
          </View>
          <View style={[styles.seatRow, ((actor != null && actor === myColor) || (won && game.winner === myColor)) && styles.seatOn]}>
            <PlayerCircle
              name={youName}
              video={bottomVideo}
              nameAbove
              celebrate={won && game.winner === myColor}
              attention={seatAttention(actor, myColor, true)}
            />
          </View>
        </View>
        <HomeButton />
        <View style={[styles.menu, { top: insets.top + 8 }]}>
          <TableMenu
            items={[
              { label: t("shareTable"), icon: "share", onPress: share },
              { label: t("tableInfo"), icon: "info", onPress: () => setInfo(true) },
              { label: t("rules"), icon: "stats", onPress: () => setRules(true) },
              { label: t("winLog"), icon: "stats", onPress: () => setLogOpen(true) },
              ...(isAdmin
                ? [
                    { label: paused ? t("resumeTable") : t("pauseTable"), icon: "pause" as const, onPress: () => onPause(!paused) },
                    { label: t("restartGame"), icon: "restart" as const, onPress: restartGame },
                  ]
                : []),
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
              <CopyField label={t("tableId")} value={gameId} />
              {password ? <CopyField label={t("password")} value={password} /> : null}
              <Pressable style={styles.cancel} onPress={share}>
                <Text style={styles.cancelText}>{t("shareTable")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={seat} transparent animationType="fade" onRequestClose={() => setSeat(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSeat(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{otherName}</Text>
              {otherBlocked ? null : (
                <Pressable
                  style={styles.cancel}
                  onPress={() => {
                    onMuteOther();
                    setSeat(false);
                  }}
                >
                  <Text style={styles.cancelText}>{otherMuted ? t("unmuteSeat") : t("muteSeat")}</Text>
                </Pressable>
              )}
              {otherBlocked ? null : (
                <Pressable
                  style={styles.cancel}
                  onPress={() => {
                    onHideOther();
                    setSeat(false);
                  }}
                >
                  <Text style={styles.cancelText}>{otherHidden ? t("showVideo") : t("hideVideo")}</Text>
                </Pressable>
              )}
              {otherId ? (
                <SeatSafety
                  credentials={credentials}
                  targetId={otherId}
                  targetName={otherName}
                  blocked={otherBlocked}
                  onClose={() => setSeat(false)}
                />
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
            send({ type: "restart" });
          }}
        />
        <TableHold top={insets.top + 56} paused={paused} idleCloseAt={idleCloseAt} serverNow={serverNow} isAdmin={isAdmin} onPause={onPause} />
        {error ? <ErrorBanner message={tableError(error, errorCode)} onClose={onDismissError} /> : null}
        {videoNotice ? <VideoNotice message={videoNotice} onClose={onDismissVideo} /> : null}
        <CameraButton on={cameraOn} held={paused} onToggle={setCamera} />
        <TalkButton on={micOn} onTalk={setMic} />
      </View>
      <TableFooter showAd={showAd} />
    </View>
  );
}

export function BackgammonScreen({ credentials }: { credentials: Credentials }) {
  const router = useRouter();
  const { state, error, errorCode, dismissError, setPaused, leave, emit } = useGameSession();
  const view = backgammonView(state);
  const video = useTableVideo(credentials, state?.paused === true, "backgammon");
  useBlockedVideo(video.holdOff, state?.players);
  const you = state?.you;
  const youId = you?.id;
  const colors = view?.colors;
  // The opponent is whoever holds the other colour. Someone watching sees white on top.
  const otherId = colors?.white === youId ? colors?.black : colors?.black === youId ? colors?.white : colors?.white;
  const other = state?.players.find((player) => player.id === otherId && player.id !== youId);
  const topTrack = other ? video.tracks.get(other.id) : undefined;
  const bottomTrack = youId ? video.tracks.get(youId) : undefined;
  const ordered = [...(state?.players ?? [])].sort((a, b) => a.seat - b.seat);
  const myColor: Color | null = youId == null ? null : colors?.white === youId ? "white" : colors?.black === youId ? "black" : null;
  return (
    <BackgammonTable
      topVideo={topTrack ? <SeatVideo track={topTrack} /> : undefined}
      bottomVideo={bottomTrack ? <SeatVideo track={bottomTrack} /> : undefined}
      youName={ordered.find((player) => player.id === youId)?.name ?? ""}
      otherName={other?.name ?? ""}
      otherId={other?.id}
      myColor={myColor}
      serverGame={view?.board}
      wins={view?.log}
      emit={emit}
      micOn={video.micOn}
      cameraOn={video.cameraOn}
      setMic={video.setMic}
      setCamera={video.setCamera}
      otherMuted={other ? video.muted.has(other.id) : false}
      otherHidden={other ? video.hidden.has(other.id) : false}
      otherBlocked={other?.blocked === true}
      credentials={credentials}
      onMuteOther={() => {
        if (other) video.toggleMute(other.id);
      }}
      onHideOther={() => {
        if (other) video.toggleHide(other.id);
      }}
      gameId={credentials.gameId}
      password={state?.password}
      isAdmin={state?.you?.isAdmin === true}
      paused={state?.paused === true}
      idleCloseAt={state?.idleCloseAt}
      serverNow={state?.serverNow}
      onPause={setPaused}
      error={error}
      errorCode={errorCode}
      onDismissError={dismissError}
      videoNotice={video.videoNotice}
      onDismissVideo={video.dismissVideoNotice}
      onLeave={() => {
        void leave().then(() => router.dismissTo("/"));
      }}
    />
  );
}

const styles = {
  ...tableStyles,
  ...StyleSheet.create({
    players: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingBottom: 28 },
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
    boardAnchor: { position: "relative" },
    diceCup: { position: "absolute", right: 10, bottom: -94, zIndex: 4 },
  }),
};
