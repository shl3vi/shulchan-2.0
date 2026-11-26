import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
import { Tile } from "@/games/tiles/Tile";
import { arrange, checkDraft, FIRST_MELD, readSet, sortRack } from "@/games/tiles/rules";
import { tilesView, type TilesPlayView, type TilesView } from "@/games/tiles/view";
import { t } from "@/i18n";
import { SeatVideo } from "@/media/SeatVideo";
import { useTableVideo } from "@/media/useTableVideo";
import { CameraButton, RoomLight, TableMenu, TalkButton } from "@/table/TableControls";
import { CopyField, ErrorBanner, HomeButton, shareTable, TableFooter, tableError, VideoNotice } from "@/table/TableParts";
import { SeatStrip, stripSize, type StripSeat } from "@/table/SeatStrip";
import { tableStyles } from "@/table/tableStyles";
import { useBlockedVideo } from "@/table/useBlockedVideo";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

type VideoTrackLike = Parameters<typeof SeatVideo>[0]["track"];

const LOBBY_TILES = ["r7a", "b7a", "o7a", "k7a", "j1"];
/** The video tiles never take more than this much height. */
const STRIP_MAX = 132;
const TOOLS_HEIGHT = 30;
const INFO_HEIGHT = 26;
const COLUMN_GAP = 10;

/** The video tiles along the top, with how many tiles each player still holds. */
function tilesSeats({
  lineup,
  seated,
  youId,
  tracks,
  closing,
  started,
  currentId,
  winners,
  onSeat,
}: {
  lineup: { id: string; name: string; left: boolean; count: number }[];
  seated: PublicPlayer[];
  youId?: string;
  tracks: Map<string, VideoTrackLike>;
  closing: ReadonlySet<string>;
  started: boolean;
  currentId?: string;
  winners: string[];
  onSeat: (player: PublicPlayer) => void;
}): StripSeat[] {
  return lineup.map((player) => {
    const seat = seated.find((entry) => entry.id === player.id);
    const track = tracks.get(player.id);
    return {
      id: player.id,
      label: player.id === youId ? t("tlYou") : player.name,
      initialOf: player.name,
      video: track ? <SeatVideo track={track} closing={closing.has(player.id)} /> : undefined,
      badge: started ? String(player.count) : undefined,
      active: currentId === player.id,
      winner: winners.includes(player.id),
      gone: player.left || (started && !seat),
      onLongPress: seat && seat.id !== youId ? () => onSeat(seat) : undefined,
    };
  });
}

type Draft = { sets: string[][]; rack: string[] };

function TilesTable({
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
  view: TilesView;
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
  const video = useTableVideo(credentials, paused, "tiles");
  useBlockedVideo(video.holdOff, state.players);

  const play = view.play;
  const me = play?.players.find((player) => player.id === youId);
  const current = play && play.phase === "playing" ? play.players[play.turn] : undefined;
  const myTurn = !paused && current != null && current.id === youId;
  const over = play?.phase === "over";

  const [draft, setDraft] = useState<Draft | null>(null);
  const [columnHeight, setColumnHeight] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"runs" | "groups">("runs");
  const [sent, setSent] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuSheet, setMenuSheet] = useState<"info" | "rules" | "log" | null>(null);
  const [seatSheet, setSeatSheet] = useState<PublicPlayer | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const seen = useRef<{ turns: number; rack: string[]; phase: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  // A new table from the server ends any arrangement in progress and calls out what happened.
  const adopt = useEffectEvent((next: TilesPlayView | null) => {
    setSent(false);
    if (!next) {
      seen.current = null;
      setDraft(null);
      setSelected([]);
      return;
    }
    const mine = next.players.find((player) => player.id === youId);
    const previous = seen.current;
    seen.current = { turns: next.turns, rack: mine?.rack ?? [], phase: next.phase };
    if (!previous || previous.turns !== next.turns || previous.phase !== next.phase) {
      setDraft(null);
      setSelected([]);
    }
    if (!previous) return;
    if (previous.phase === "playing" && next.phase === "over") playSfx("applause");
    if (previous.turns === next.turns || !next.last) return;
    const who = next.players.find((player) => player.id === next.last!.playerId);
    const name = who?.id === youId ? t("tlYou") : who?.name ?? "";
    if (next.last.kind === "play") {
      playSfx("chipsPush", 0.7);
      say(t("tlPlayed", { name, n: next.last.tiles }));
    } else if (next.last.kind === "draw") {
      playSfx("cardDeal");
      if (who?.id === youId) {
        const added = (mine?.rack ?? []).find((tile) => !previous.rack.includes(tile));
        if (added) setFresh(added);
      } else say(t("tlDrew", { name }));
    } else say(t("tlPassed", { name }));
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    adopt(play);
  }, [play]);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const baseTable = play?.table ?? [];
  const baseRack = me?.rack ?? [];
  const sets = draft?.sets ?? baseTable;
  const rack = sortRack(draft?.rack ?? baseRack, sortMode);
  const onTableBefore = new Set(baseTable.flat());
  const check = checkDraft(baseTable, sets, me?.melded === true);
  const changed = draft != null && check.placed > 0;
  const selecting = selected.length > 0;

  // The rack's inner width: the column less its padding and the rack's own. Ten tiles fit on a row.
  // Column padding 24, rack padding 20, its border 2, and a little slack for rounding.
  const rackInner = Math.min(width, 560) - 24 - 20 - 2 - 2;
  const rackTile = Math.min(38, Math.floor((rackInner - 9 * 4) / 10));
  const boardTile = Math.min(30, Math.floor(rackTile * 0.8));
  const perRow = Math.max(1, Math.floor((rackInner + 4) / (rackTile + 4)));
  const rackRows = Math.max(1, Math.ceil(rack.length / perRow));
  // A wrapping row reports one line when the column shares out its height, so the rack says how tall it is.
  const rackHeight = rackRows * Math.round(rackTile * 1.36) + (rackRows - 1) * 4 + 24;
  const stripWidth = Math.min(width, 560) - 24;

  function send(type: string, body: object = {}) {
    if (paused) return;
    emit("move", { type, ...body });
  }

  function toggle(tile: string) {
    if (!myTurn || sent) return;
    playSfx("cardFlip", 0.35);
    setSelected((value) => (value.includes(tile) ? value.filter((entry) => entry !== tile) : [...value, tile]));
  }

  /** Lifts the selected tiles out of wherever they are and hands back the rest. */
  function lift(current: Draft) {
    return {
      sets: current.sets.map((set) => set.filter((tile) => !selected.includes(tile))),
      rack: current.rack.filter((tile) => !selected.includes(tile)),
    };
  }

  function into(index: number | "new") {
    if (!myTurn || !selecting) return;
    const base: Draft = draft ?? { sets: baseTable, rack: baseRack };
    const lifted = lift(base);
    const target = index === "new" ? selected.slice() : [...lifted.sets[index], ...selected];
    const nextSets = index === "new" ? [...lifted.sets, arrange(target)] : lifted.sets.map((set, at) => (at === index ? arrange(target) : set));
    setDraft({ sets: nextSets.filter((set) => set.length > 0), rack: lifted.rack });
    setSelected([]);
    playSfx("checkerPlace", 0.6);
  }

  function back() {
    if (!myTurn || !selecting) return;
    const stuck = selected.filter((tile) => onTableBefore.has(tile));
    const mine = selected.filter((tile) => !onTableBefore.has(tile));
    const base: Draft = draft ?? { sets: baseTable, rack: baseRack };
    if (mine.length > 0) {
      setDraft({
        sets: base.sets.map((set) => set.filter((tile) => !mine.includes(tile))).filter((set) => set.length > 0),
        rack: [...base.rack.filter((tile) => !mine.includes(tile)), ...mine.filter((tile) => !base.rack.includes(tile))],
      });
    }
    if (stuck.length > 0) say(t("tlTableStays"));
    setSelected(stuck);
  }

  function undo() {
    setDraft(null);
    setSelected([]);
  }

  function done() {
    if (!changed || !check.ok) return;
    setSent(true);
    setSelected([]);
    send("play", { table: sets });
  }

  function drawTile() {
    if (!myTurn || sent) return;
    setSent(true);
    undo();
    send("draw");
  }

  function share() {
    shareTable(credentials.gameId, state.password);
  }

  const lineup = play
    ? play.players
    : [...state.players].sort((a, b) => a.seat - b.seat).slice(0, 4).map((player) => ({ id: player.id, name: player.name, melded: false, left: false, count: 0 }));
  const strip = stripSize(lineup.length, stripWidth, STRIP_MAX);
  // The felt takes what the column has left. Measured, because a share of the column's height
  // went wrong on Android: the felt kept its own height and pushed the rack under the dock.
  const rackShown = me != null && play != null && !over;
  const below = play && !over ? INFO_HEIGHT + COLUMN_GAP + (rackShown ? TOOLS_HEIGHT + 6 + rackHeight + COLUMN_GAP : 0) : 0;
  const feltHeight = columnHeight == null || !play ? null : Math.max(120, columnHeight - insets.top - 54 - strip.height - COLUMN_GAP - below - 8);
  const seated = state.players.some((player) => player.id === youId);
  const ranking = over && play ? [...play.players].sort((a, b) => (play.points[b.id] ?? 0) - (play.points[a.id] ?? 0)) : [];

  let status = "";
  if (play && !over) {
    if (!me) status = t("tlWatching");
    else if (!myTurn) status = t("tlTheirTurn", { name: current?.name ?? "" });
    else if (!me.melded) status = t("tlFirstMeld", { points: check.meldPoints, need: FIRST_MELD });
    else status = selecting ? t("tlPlaceHint") : t("tlYourTurn");
  }

  let action: ReactNode = null;
  if (!play || over) {
    const enough = state.players.length >= 2;
    action = seated ? (
      <Pressable
        style={({ pressed }) => [styles.primary, !enough || paused ? styles.primaryOff : null, pressed && enough ? styles.pressed : null]}
        disabled={!enough || paused}
        onPress={() => send("start")}
      >
        <Ionicons name={over ? "refresh" : "play"} size={20} color={enough ? "#1c1917" : "#8b8da3"} />
        <Text style={[styles.primaryText, !enough ? styles.primaryTextOff : null]} numberOfLines={1}>
          {!enough ? t("tlNeedsTwo") : over ? t("tlPlayAgain") : t("tlStart")}
        </Text>
      </Pressable>
    ) : null;
  } else if (myTurn) {
    action = changed ? (
      <Pressable
        style={({ pressed }) => [styles.primary, check.ok ? styles.doneButton : styles.primaryOff, pressed && check.ok ? styles.pressed : null]}
        disabled={!check.ok || sent}
        onPress={done}
      >
        <Ionicons name={check.ok ? "checkmark-circle" : "alert-circle"} size={20} color={check.ok ? "#0f2a22" : "#f19c9c"} />
        <Text style={[styles.primaryText, !check.ok ? styles.primaryTextBad : null]} numberOfLines={1}>
          {check.ok ? t("tlDone") : !check.allValid ? t("tlFixSets") : !check.untouched ? t("tlFirstOwn") : t("tlNeedPoints", { n: FIRST_MELD - check.meldPoints })}
        </Text>
      </Pressable>
    ) : (
      <Pressable style={({ pressed }) => [styles.primary, sent ? styles.primaryOff : null, pressed ? styles.pressed : null]} disabled={sent} onPress={drawTile}>
        <Ionicons name="add-circle" size={20} color="#1c1917" />
        <Text style={styles.primaryText} numberOfLines={1}>{play.poolCount > 0 ? t("tlDraw") : t("tlPass")}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <RoomLight />
        <View style={[styles.column, { paddingTop: insets.top + 54 }]} onLayout={(event) => setColumnHeight(event.nativeEvent.layout.height)}>
          <View style={{ height: strip.height }}>
            <SeatStrip
              width={stripWidth}
              maxHeight={STRIP_MAX}
              seats={tilesSeats({
                lineup,
                seated: state.players,
                youId,
                tracks: video.tracks,
                closing: video.closing,
                started: play != null,
                currentId: current?.id,
                winners: over && play ? play.winners : [],
                onSeat: setSeatSheet,
              })}
            />
          </View>

          {play ? (
            // The felt fills a slot that may shrink: drawn absolutely, its contents never hold the slot open.
            <View style={feltHeight == null ? styles.feltSlot : { height: feltHeight }}>
            <View style={styles.felt}>
              <View style={styles.feltRim} pointerEvents="none" />
              {over ? (
                <View style={styles.podium}>
                  <Ionicons name="trophy" size={30} color="#f6d36b" />
                  <Text style={styles.podiumTitle}>
                    {ranking[0]?.id === youId ? t("tlYouWin") : t("tlWins", { name: ranking[0]?.name ?? "" })}
                  </Text>
                  <View style={styles.podiumList}>
                    {ranking.map((player, index) => (
                      <View key={player.id} style={styles.podiumRow}>
                        <Text style={styles.podiumPlace}>{index + 1}</Text>
                        <Text style={styles.podiumName} numberOfLines={1}>{player.id === youId ? t("tlYou") : player.name}</Text>
                        <Text style={[styles.podiumPoints, (play.points[player.id] ?? 0) < 0 ? styles.podiumMinus : null]}>
                          {(play.points[player.id] ?? 0) > 0 ? `+${play.points[player.id]}` : String(play.points[player.id] ?? 0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
                  {sets.length === 0 && !selecting ? (
                    <Text style={styles.emptyBoard}>{myTurn ? t("tlEmptyMine") : t("tlEmpty")}</Text>
                  ) : null}
                  {sets.map((set, index) => {
                    const good = readSet(set) != null;
                    return (
                      <Pressable
                        key={`${index}-${set[0]}`}
                        onPress={() => into(index)}
                        disabled={!myTurn || !selecting}
                        style={[styles.set, !good ? styles.setBad : null, myTurn && selecting ? styles.setTarget : null]}
                      >
                        {set.map((tile) => (
                          <Tile
                            key={tile}
                            tile={tile}
                            width={boardTile}
                            lifted={selected.includes(tile)}
                            fresh={draft != null && !onTableBefore.has(tile)}
                            onPress={myTurn ? () => (selecting && !selected.includes(tile) && !selected.some((entry) => set.includes(entry)) ? into(index) : toggle(tile)) : undefined}
                            disabled={!myTurn}
                          />
                        ))}
                      </Pressable>
                    );
                  })}
                  {myTurn && selecting ? (
                    <Pressable style={styles.newSet} onPress={() => into("new")}>
                      <Ionicons name="add" size={18} color="#f6d36b" />
                      <Text style={styles.newSetText}>{t("tlNewSet")}</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              )}
            </View>
            </View>
          ) : (
            <View style={styles.lobby}>
              <View style={styles.lobbyTiles}>
                {LOBBY_TILES.map((tile, index) => (
                  <View key={tile} style={{ transform: [{ rotate: `${(index - 2) * 6}deg` }, { translateY: Math.abs(index - 2) * 4 }] }}>
                    <Tile tile={tile} width={40} />
                  </View>
                ))}
              </View>
              <Text style={styles.lobbyTitle}>{t("tilesTable")}</Text>
              <Text style={styles.lobbyText}>{t("tlLobbyText")}</Text>
              <View style={styles.facts}>
                {(["tlFact1", "tlFact2", "tlFact3"] as const).map((fact) => (
                  <View key={fact} style={styles.fact}>
                    <Ionicons name="sparkles" size={14} color="#f6d36b" />
                    <Text style={styles.factText}>{t(fact)}</Text>
                  </View>
                ))}
              </View>
              {state.players.length < 2 ? (
                <Pressable style={styles.invite} onPress={share}>
                  <Ionicons name="person-add" size={18} color="#c8ceff" />
                  <Text style={styles.inviteText}>{t("tlInvite")}</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {play && !over ? (
            <View style={styles.infoRow}>
              <View style={styles.pool}>
                <Ionicons name="albums" size={14} color="#c8ceff" />
                <Text style={styles.poolText}>{play.poolCount}</Text>
              </View>
              <Text style={[styles.status, myTurn ? styles.statusMine : null]} numberOfLines={1}>{action ? status : ""}</Text>
              {myTurn && me && !me.melded ? (
                <View style={styles.meter}>
                  <View style={[styles.meterFill, { width: `${Math.min(100, (check.meldPoints / FIRST_MELD) * 100)}%` }, check.meldPoints >= FIRST_MELD ? styles.meterFull : null]} />
                </View>
              ) : null}
            </View>
          ) : null}

          {me && play && !over ? (
            <View style={styles.rackWrap}>
              <View style={styles.tools}>
                <Pressable style={styles.tool} onPress={() => setSortMode((mode) => (mode === "runs" ? "groups" : "runs"))}>
                  <Ionicons name="swap-vertical" size={15} color="#c8ceff" />
                  <Text style={styles.toolText}>{sortMode === "runs" ? t("tlSortRuns") : t("tlSortGroups")}</Text>
                </Pressable>
                {myTurn && draft ? (
                  <Pressable style={styles.tool} onPress={undo}>
                    <Ionicons name="arrow-undo" size={15} color="#c8ceff" />
                    <Text style={styles.toolText}>{t("tlUndo")}</Text>
                  </Pressable>
                ) : null}
                {myTurn && selecting ? (
                  <Pressable style={styles.tool} onPress={() => setSelected([])}>
                    <Ionicons name="close" size={15} color="#c8ceff" />
                    <Text style={styles.toolText}>{t("tlClear")}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable style={[styles.rack, { height: rackHeight }]} onPress={back} disabled={!myTurn || !selecting}>
                {rack.map((tile) => (
                  <Tile
                    key={tile}
                    tile={tile}
                    width={rackTile}
                    lifted={selected.includes(tile)}
                    fresh={fresh === tile}
                    onPress={() => {
                      if (fresh === tile) setFresh(null);
                      // With tiles picked up from the table, a tap on the rack takes them back; otherwise it picks this tile.
                      if (selected.some((entry) => !rack.includes(entry))) back();
                      else toggle(tile);
                    }}
                  />
                ))}
                {myTurn && selecting && selected.some((tile) => !rack.includes(tile)) ? (
                  <View style={styles.backHint}>
                    <Ionicons name="arrow-down" size={14} color="#f6d36b" />
                    <Text style={styles.backHintText}>{t("tlBackToRack")}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          ) : null}
        </View>

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
                    ...(play ? [{ label: t("restartGame"), icon: "restart" as const, onPress: () => (over ? send("start") : setConfirmRestart(true)) }] : []),
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
                  <Text style={styles.statsLine}>{t("tlRules")}</Text>
                  <Pressable style={styles.cancel} onPress={() => setMenuSheet(null)}>
                    <Text style={styles.cancelText}>{t("cancel")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>{t("winLog")}</Text>
                  {view.log.length === 0 ? <Text style={styles.statsLine}>{t("winLogEmpty")}</Text> : [...view.log].reverse().slice(0, 12).map((entry, index) => (
                    <Text key={index} style={styles.statsLine}>
                      {entry.scores.map((line) => `${line.name} ${line.points > 0 ? "+" : ""}${line.points}`).join(" · ")}
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

export function TilesScreen({ credentials }: { credentials: Credentials }) {
  const router = useRouter();
  const { state, error, errorCode, dismissError, setPaused, leave, emit } = useGameSession();
  const view = tilesView(state);
  if (!state || !view) return <View style={styles.screen} />;
  return (
    <TilesTable
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
    column: { flex: 1, paddingHorizontal: 12, gap: COLUMN_GAP, alignSelf: "center", width: "100%", maxWidth: 560 },
    stripScroll: { flexGrow: 0, flexShrink: 0 },
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
      alignItems: "center",
      justifyContent: "center",
    },
    chipClip: { width: "100%", height: "100%", borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    chipActive: { borderWidth: 3, borderColor: "#86e3c4", boxShadow: "0 0 14px rgba(134,227,196,0.55)" },
    chipWinner: { borderColor: "#f6d36b", boxShadow: "0 0 16px rgba(246,211,107,0.6)" },
    chipInitial: { color: "#fafaf9", fontSize: 20, fontWeight: "800" },
    crown: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#f6d36b", alignItems: "center", justifyContent: "center" },
    chipCount: {
      position: "absolute",
      bottom: -9,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
      backgroundColor: "#1d2038",
      borderWidth: 1,
      borderColor: "rgba(200,206,255,0.25)",
    },
    chipCountOn: { backgroundColor: "#86e3c4", borderColor: "#86e3c4" },
    chipCountText: { color: "#c8ceff", fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
    chipCountTextOn: { color: "#171b35" },
    chipName: { color: "#a6a8c8", fontSize: 12, fontWeight: "700", maxWidth: 60 },
    chipNameOn: { color: "#f7f7fc" },
    chipNameBelow: { marginTop: 6 },
    feltSlot: { flex: 1, minHeight: 0 },
    felt: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: 22,
      backgroundColor: "#0f3a31",
      backgroundImage: "radial-gradient(ellipse at 50% 20%, #1b6553 0%, #124638 55%, #0b2c25 100%)",
      borderWidth: 3,
      borderColor: "#6b4a26",
      boxShadow: "inset 0 6px 18px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.45)",
      overflow: "hidden",
    },
    feltRim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 19, borderWidth: 1, borderColor: "rgba(246,211,107,0.25)" },
    board: { flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 8, padding: 10, paddingTop: 14 },
    emptyBoard: { color: "rgba(223,226,255,0.55)", fontSize: 14, fontWeight: "700", textAlign: "center", width: "100%", marginTop: 40 },
    set: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 2,
      padding: 4,
      borderRadius: 9,
      backgroundColor: "rgba(0,0,0,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    setBad: { borderWidth: 2, borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.22)", boxShadow: "0 0 10px rgba(248,113,113,0.45)" },
    setTarget: { borderColor: "rgba(246,211,107,0.6)", borderStyle: "dashed" },
    newSet: {
      minWidth: 92,
      height: 48,
      borderRadius: 9,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: "#f6d36b",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      backgroundColor: "rgba(246,211,107,0.08)",
    },
    newSetText: { color: "#f6d36b", fontWeight: "900" },
    podium: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
    podiumTitle: { color: "#f7f7fc", fontSize: 20, fontWeight: "900", textAlign: "center" },
    podiumList: { alignSelf: "stretch", gap: 4 },
    podiumRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.22)" },
    podiumPlace: { color: "#f6d36b", fontWeight: "900", width: 16, textAlign: "center" },
    podiumName: { color: "#f7f7fc", fontWeight: "800", flex: 1 },
    podiumPoints: { color: "#86e3c4", fontWeight: "900", fontVariant: ["tabular-nums"] },
    podiumMinus: { color: "#f19c9c" },
    infoRow: { height: INFO_HEIGHT, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, flexShrink: 0 },
    pool: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(200,206,255,0.10)" },
    poolText: { color: "#c8ceff", fontWeight: "900", fontVariant: ["tabular-nums"] },
    status: { color: "#a6a8c8", fontSize: 13, fontWeight: "700", flex: 1 },
    statusMine: { color: "#86e3c4" },
    meter: { width: 64, height: 6, borderRadius: 3, backgroundColor: "rgba(200,206,255,0.14)", overflow: "hidden" },
    meterFill: { height: 6, borderRadius: 3, backgroundColor: "#f6d36b" },
    meterFull: { backgroundColor: "#86e3c4" },
    rackWrap: { gap: 6, flexShrink: 0 },
    tools: { height: TOOLS_HEIGHT, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
    tool: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: "rgba(168,178,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(168,178,255,0.22)",
    },
    toolText: { color: "#dfe2ff", fontSize: 12, fontWeight: "800" },
    rack: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      padding: 10,
      paddingTop: 12,
      borderRadius: 16,
      backgroundColor: "#5b3a1e",
      backgroundImage: "linear-gradient(180deg, #7a5230 0%, #5b3a1e 60%, #43290f 100%)",
      borderWidth: 1,
      borderColor: "#8a6236",
      boxShadow: "inset 0 2px 0 rgba(255,255,255,0.12), 0 8px 18px rgba(0,0,0,0.45)",
    },
    backHint: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, alignSelf: "center" },
    backHintText: { color: "#f6d36b", fontSize: 12, fontWeight: "900" },
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
    lobbyTiles: { flexDirection: "row", gap: 6, marginBottom: 6 },
    lobbyTitle: { color: "#f7f7fc", fontSize: 26, fontWeight: "900" },
    lobbyText: { color: "#a6a8c8", fontSize: 15, textAlign: "center", lineHeight: 21 },
    facts: { alignSelf: "stretch", gap: 8, marginTop: 4 },
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
    primary: {
      height: 52,
      borderRadius: 26,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "#f6d36b",
      backgroundImage: "linear-gradient(180deg, #ffe28c 0%, #f6d36b 50%, #d9ae3e 100%)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6)",
    },
    doneButton: { backgroundColor: "#86e3c4", backgroundImage: "linear-gradient(180deg, #a6f0d6 0%, #86e3c4 50%, #5cc6a3 100%)" },
    primaryOff: { backgroundColor: "#2a2d44", backgroundImage: "none", boxShadow: "none" },
    pressed: { transform: [{ scale: 0.97 }] },
    primaryText: { color: "#1c1917", fontSize: 16, fontWeight: "900", flexShrink: 1 },
    primaryTextOff: { color: "#8b8da3" },
    primaryTextBad: { color: "#f6c7c7" },
    toast: { position: "absolute", left: 64, right: 64, zIndex: 9, alignItems: "center" },
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
  }),
};
