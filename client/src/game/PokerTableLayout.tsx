import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { betAnchor, FELT, RAIL, SEAT_CENTERS, SEAT_H, SEAT_TOP, SEAT_W, STAGE_H, STAGE_W } from "@/game/tableStage";
import type { Card } from "@/game/types";
import { t } from "@/i18n";

export type SeatSlot = {
  name: string;
  stack: number;
  bet: number;
  toAct: boolean;
  isYou: boolean;
  winner?: boolean;
  video?: ReactNode;
};

export type PokerAction = "fold" | "check" | "call" | "bet" | "raise";

const CHIP = 22;

const suitMark: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function isRed(suit: string) {
  return suit === "hearts" || suit === "diamonds";
}

function PlayingCard({
  card,
  back,
  size,
  scale,
}: {
  card?: Card;
  back?: boolean;
  size: "board" | "hole";
  scale: number;
}) {
  const u = (n: number) => n * scale;
  const board = size === "board";
  const box = {
    width: u(board ? 26 : 20),
    height: u(board ? 38 : 28),
    borderRadius: u(4),
    backgroundColor: "white",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
  };
  if (back) {
    return (
      <View style={[box, { backgroundColor: "#172554", borderWidth: u(1), borderColor: "#93c5fd" }]}>
        <Text style={{ color: "#bfdbfe", fontSize: u(board ? 14 : 11) }}>♠</Text>
      </View>
    );
  }
  if (!card) {
    return (
      <View
        style={[
          box,
          {
            backgroundColor: "transparent",
            borderWidth: u(1),
            borderColor: "rgba(255,255,255,0.22)",
            boxShadow: "none",
          },
        ]}
      />
    );
  }
  const red = isRed(card.suit);
  const rank = card.rank === "T" ? "10" : card.rank;
  return (
    <View style={box}>
      <Text style={{ fontSize: u(rank === "10" ? (board ? 12 : 9) : board ? 14 : 11), fontWeight: "800", color: red ? "#b91c1c" : "#1c1917" }}>
        {rank}
      </Text>
      <Text style={{ fontSize: u(board ? 12 : 10), color: red ? "#b91c1c" : "#1c1917" }}>
        {suitMark[card.suit] ?? card.suit}
      </Text>
    </View>
  );
}

function BetChip({ amount, scale }: { amount: number; scale: number }) {
  const u = (n: number) => n * scale;
  return (
    <View
      style={{
        width: u(CHIP),
        height: u(CHIP),
        borderRadius: u(CHIP / 2),
        backgroundColor: "#b45309",
        borderWidth: Math.max(1, u(2)),
        borderColor: "#f6e2a8",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: "#fef3c7", fontSize: u(10), fontWeight: "800" }}
      >
        {amount}
      </Text>
    </View>
  );
}

function ShownCards({ cards, scale }: { cards: Card[]; scale: number }) {
  const u = (n: number) => n * scale;
  return (
    <View style={{ flexDirection: "row", gap: u(2) }}>
      {cards.slice(0, 2).map((card, index) => (
        <PlayingCard key={index} card={card} size="hole" scale={scale} />
      ))}
    </View>
  );
}

function WinnerFrame({ scale, children }: { scale: number; children: ReactNode }) {
  const u = (n: number) => n * scale;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const w = u(64);
  const h = u(96);
  const span = Math.hypot(w, h);
  return (
    <View style={{ width: w, height: h, borderRadius: u(8), overflow: "hidden" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: span,
          height: span,
          left: (w - span) / 2,
          top: (h - span) / 2,
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
        }}
      >
        <View style={{ flex: 1, backgroundColor: "#b45309" }} />
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "46%", backgroundColor: "#fbbf24" }} />
        <View style={{ position: "absolute", left: "38%", top: 0, bottom: 0, width: "14%", backgroundColor: "#fff7d6" }} />
      </Animated.View>
      <View
        style={{
          position: "absolute",
          top: u(3),
          left: u(3),
          right: u(3),
          bottom: u(3),
          borderRadius: u(6),
          overflow: "hidden",
          backgroundColor: "#1c1917",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function SeatView({ player, scale }: { player?: SeatSlot; scale: number }) {
  const u = (n: number) => n * scale;
  const occupied = player != null;
  const ring = player?.toAct ? "#f6d36b" : occupied ? "#44403c" : "#57534e";
  const face = player?.video ?? (
    <Text style={{ color: occupied ? "#fafaf9" : "#78716c", fontSize: u(16), fontWeight: "700" }}>
      {occupied ? player.name.trim().slice(0, 1).toUpperCase() : "+"}
    </Text>
  );
  return (
    <View style={{ width: u(SEAT_W), height: u(SEAT_H), alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: u(3) }}>
        {player?.winner ? (
          <WinnerFrame scale={scale}>{face}</WinnerFrame>
        ) : (
          <View
            style={{
              width: u(64),
              height: u(96),
              borderRadius: u(8),
              overflow: "hidden",
              borderWidth: u(2),
              borderColor: ring,
              backgroundColor: "#1c1917",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {face}
          </View>
        )}
      </View>
      <View
        style={{
          marginTop: u(2),
          width: u(SEAT_W),
          height: u(28),
          borderRadius: u(8),
          paddingHorizontal: u(4),
          backgroundColor: occupied ? "rgba(12,10,9,0.92)" : "rgba(12,10,9,0.45)",
          borderWidth: u(1),
          borderColor: player?.toAct ? "#e8c98a" : "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: occupied ? "#fafaf9" : "#a8a29e", fontSize: u(10), lineHeight: u(12), fontWeight: "700" }}
        >
          {player?.name ?? t("openSeat")}
        </Text>
        {occupied ? (
          <Text style={{ color: "#f6d36b", fontSize: u(10), lineHeight: u(12), fontWeight: "800" }}>{player.stack}</Text>
        ) : null}
      </View>
    </View>
  );
}

function TableFelt({
  scale,
  community,
  pot,
  round,
  winners,
  onDeal,
}: {
  scale: number;
  community: Card[];
  pot: number;
  round: string | null;
  winners: { name: string; amount: number }[];
  onDeal?: () => void;
}) {
  const u = (n: number) => n * scale;
  const railW = FELT.w + RAIL * 2;
  const railH = FELT.h + RAIL * 2;
  const radius = u(railW / 2);
  return (
    <View
      style={{
        position: "absolute",
        left: u(FELT.x - RAIL),
        top: u(FELT.y - RAIL),
        width: u(railW),
        height: u(railH),
        borderRadius: radius,
        backgroundColor: "#071a12",
        padding: u(RAIL),
        boxShadow: "0 10px 18px rgba(0,0,0,0.5)",
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: u(FELT.w / 2),
          backgroundColor: "#157a40",
          borderWidth: u(10),
          borderColor: "#0c4e2a",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
          <View
            style={{
              pointerEvents: "none",
              position: "absolute",
              left: "16%",
              top: "18%",
              width: "68%",
              height: "64%",
              borderRadius: u(FELT.h),
              backgroundColor: "#1a8a4c",
              opacity: 0.55,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              color: winners.length ? "#fef3c7" : "#d1fae5",
              fontSize: u(11),
              fontWeight: "700",
              letterSpacing: 0.6,
              marginBottom: u(4),
              paddingHorizontal: u(16),
            }}
          >
            {winners.length
              ? winners.map((winner) => `${winner.name} +${winner.amount}`).join("  ·  ")
              : round
                ? t(round === "preflop" || round === "flop" || round === "turn" || round === "river" ? round : "waiting")
                : t("waiting")}
          </Text>
          <View style={{ flexDirection: "row", gap: u(4), zIndex: 1 }}>
            {Array.from({ length: 5 }, (_, index) => (
              <PlayingCard key={index} card={community[index]} size="board" scale={scale} />
            ))}
          </View>
          <View style={{ height: u(20), marginTop: u(6), flexDirection: "row", alignItems: "center", gap: u(6) }}>
            {pot > 0 ? (
              <>
                <View
                  style={{
                    width: u(16),
                    height: u(16),
                    borderRadius: u(8),
                    backgroundColor: "#b45309",
                    borderWidth: Math.max(1, u(2)),
                    borderColor: "#f6e2a8",
                  }}
                />
                <Text style={{ color: "#ecfccb", fontWeight: "800", fontSize: u(14) }}>{pot}</Text>
              </>
            ) : null}
          </View>
          {onDeal && round == null ? (
            <Pressable
              style={{
                marginTop: u(4),
                backgroundColor: "#e8c98a",
                borderRadius: u(14),
                paddingHorizontal: u(18),
                paddingVertical: u(6),
              }}
              onPress={onDeal}
            >
              <Text style={{ color: "#1c1917", fontWeight: "800", fontSize: u(13) }}>{t("deal")}</Text>
            </Pressable>
          ) : null}
        </View>
    </View>
  );
}

export function PokerTableLayout({
  seats,
  shown,
  community,
  pot,
  round,
  winners = [],
  onDeal,
}: {
  seats: Array<SeatSlot | undefined>;
  shown: Card[][];
  community: Card[];
  pot: number;
  round: string | null;
  winners?: { name: string; amount: number }[];
  onDeal?: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = size.width > 0 && size.height > 0 ? Math.min(size.width / STAGE_W, size.height / STAGE_H) : 0;
  const heroSeat = seats.findIndex((seat) => seat?.isYou);
  const hero = heroSeat >= 0 ? heroSeat : 0;
  const u = (n: number) => n * scale;

  return (
    <View
      collapsable={false}
      style={styles.room}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      <View style={styles.wash} />
      {scale > 0 ? (
        <View
          style={{
            position: "absolute",
            width: u(STAGE_W),
            height: u(STAGE_H),
            left: (size.width - u(STAGE_W)) / 2,
            top: (size.height - u(STAGE_H)) / 2,
          }}
        >
          <TableFelt scale={scale} community={community} pot={pot} round={round} winners={winners} onDeal={onDeal} />
          {SEAT_CENTERS.map((center, visual) => {
            const seatIndex = (hero + visual) % SEAT_CENTERS.length;
            const player = seats[seatIndex];
            const revealed = shown[seatIndex] ?? [];
            if (revealed.length > 0) {
              const anchor = betAnchor(visual);
              return (
                <View key={`shown-${visual}`} style={{ position: "absolute", left: u(anchor.x - 22), top: u(anchor.y - 16), zIndex: 2 }}>
                  <ShownCards cards={revealed} scale={scale} />
                </View>
              );
            }
            if (!player || player.bet <= 0) return null;
            const anchor = betAnchor(visual);
            return (
              <View
                key={`bet-${visual}`}
                style={{
                  position: "absolute",
                  left: u(anchor.x - CHIP / 2),
                  top: u(anchor.y - CHIP / 2),
                  zIndex: 2,
                }}
              >
                <BetChip amount={player.bet} scale={scale} />
              </View>
            );
          })}
          {SEAT_CENTERS.map((center, visual) => {
            const player = seats[(hero + visual) % SEAT_CENTERS.length];
            return (
              <View
                key={`seat-${visual}`}
                style={{
                  position: "absolute",
                  left: u(center.x - SEAT_W / 2),
                  top: u(center.y - SEAT_TOP),
                  zIndex: 3,
                }}
              >
                <SeatView player={player} scale={scale} />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function TalkButton({ on, onTalk }: { on: boolean; onTalk: (on: boolean) => void }) {
  return (
    <Pressable
      style={[styles.talk, on && styles.talkOn]}
      onPressIn={() => onTalk(true)}
      onPressOut={() => onTalk(false)}
    >
      <MicIcon muted={!on} />
    </Pressable>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <View style={styles.mic}>
      <View style={[styles.micHead, muted && styles.micMuted]} />
      <View style={[styles.micArc, muted && styles.micMutedBorder]} />
      <View style={[styles.micStem, muted && styles.micMuted]} />
      {muted ? <View style={styles.micSlash} /> : null}
    </View>
  );
}

function betPresets(min: number, max: number) {
  const span = Math.max(0, max - min);
  return [0, 1, 2, 3].map((step) => {
    const value = Math.round(min + (span * step) / 3);
    const label = step === 0 ? t("minBet") : step === 3 ? t("maxBet") : "";
    return { value, label, key: String(step) };
  });
}

function actionStyle(action: PokerAction) {
  if (action === "fold") return dock.fold;
  if (action === "bet" || action === "raise") return dock.raise;
  return dock.call;
}

export function ActionDock({
  actions,
  yourTurn,
  chipRange = null,
  step,
  cards,
  onAction,
}: {
  actions: PokerAction[];
  yourTurn: boolean;
  chipRange?: { min: number; max: number } | null;
  step: number;
  cards: Card[];
  onAction: (action: PokerAction, amount?: number) => void;
}) {
  const [sizing, setSizing] = useState<PokerAction | null>(null);
  const [chips, setChips] = useState(0);
  const quiet = actions.filter((action) => action !== "bet" && action !== "raise");
  const sized = actions.filter((action) => action === "bet" || action === "raise");
  const min = chipRange?.min ?? 0;
  const max = chipRange?.max ?? 0;
  const jump = Math.max(1, Math.min(step, Math.max(1, max - min)));
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopHold() {
    if (holdStart.current) clearTimeout(holdStart.current);
    if (hold.current) clearInterval(hold.current);
    holdStart.current = null;
    hold.current = null;
  }

  function nudge(direction: -1 | 1) {
    setChips((value) => Math.min(max, Math.max(min, value + direction * jump)));
  }

  function startHold(direction: -1 | 1) {
    stopHold();
    nudge(direction);
    holdStart.current = setTimeout(() => {
      hold.current = setInterval(() => nudge(direction), 70);
    }, 320);
  }

  return (
    <>
      <View style={dock.bar}>
        <View style={dock.hole}>
          {cards.slice(0, 2).map((card, index) => (
            <PlayingCard key={index} card={card} size="board" scale={1} />
          ))}
        </View>
        <View style={dock.actions}>
          {yourTurn ? (
            <View style={dock.row}>
              {quiet.map((action) => (
                <Pressable key={action} style={({ pressed }) => [dock.button, actionStyle(action), pressed && dock.pressed]} onPress={() => onAction(action)}>
                  <Text style={dock.buttonText}>{t(action)}</Text>
                </Pressable>
              ))}
              {chipRange ? (
                <Pressable
                  style={({ pressed }) => [dock.button, dock.allIn, pressed && dock.pressed]}
                  onPress={() => sized[0] && onAction(sized[0], chipRange.max)}
                >
                  <Text style={dock.buttonText}>{t("allIn")}</Text>
                </Pressable>
              ) : null}
              {sized.map((action) => (
                <Pressable
                  key={action}
                  style={({ pressed }) => [dock.button, actionStyle(action), pressed && dock.pressed]}
                  onPress={() => {
                    setChips(min);
                    setSizing(action);
                  }}
                >
                  <Text style={dock.buttonText}>{t(action)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={dock.wait}>{t("waitingTurn")}</Text>
          )}
        </View>
      </View>
      <Modal visible={sizing != null} transparent animationType="fade" onRequestClose={() => setSizing(null)}>
        <View style={dock.shade}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSizing(null)} />
          <View style={dock.prompt}>
            <View style={dock.promptHead}>
              <Text style={dock.promptTitle}>{sizing ? t(sizing) : ""}</Text>
              <Pressable onPress={() => setSizing(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color="#a8a29e" />
              </Pressable>
            </View>
            <View style={dock.stepper}>
              <Pressable style={dock.step} onPressIn={() => startHold(-1)} onPressOut={stopHold}>
                <Text style={dock.stepText}>−</Text>
              </Pressable>
              <Text style={dock.chips}>{chips}</Text>
              <Pressable style={dock.step} onPressIn={() => startHold(1)} onPressOut={stopHold}>
                <Text style={dock.stepText}>+</Text>
              </Pressable>
            </View>
            <View style={dock.presets}>
              {betPresets(min, max).map((preset) => (
                <Pressable key={preset.key} style={[dock.preset, chips === preset.value && dock.presetOn]} onPress={() => setChips(preset.value)}>
                  <Text style={dock.presetLabel}>{preset.label}</Text>
                  <Text style={dock.presetValue}>{preset.value}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [dock.confirm, pressed && dock.pressed]}
              onPress={() => {
                if (!sizing) return;
                onAction(sizing, chips);
                setSizing(null);
              }}
            >
              <Text style={dock.buttonText}>{sizing ? t(sizing) : ""}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuGlyph({ kind }: { kind?: "share" | "leave" | "stats" | "admin" }) {
  if (kind === "share") return <Ionicons name="share-outline" size={18} color="#fafaf9" />;
  if (kind === "leave") return <Ionicons name="warning" size={18} color="#f87171" />;
  if (kind === "admin") return <Ionicons name="shield-checkmark-outline" size={18} color="#fafaf9" />;
  return <Ionicons name="stats-chart" size={18} color="#fafaf9" />;
}

export function TableMenu({
  items,
}: {
  items: { label: string; onPress: () => void; danger?: boolean; icon?: "share" | "leave" | "stats" | "admin" }[];
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={menu.wrap}>
      <Pressable style={menu.button} onPress={() => setOpen((value) => !value)} hitSlop={8}>
        <View style={menu.bar} />
        <View style={menu.bar} />
        <View style={menu.bar} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={menu.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[menu.panel, { top: insets.top + 56, right: 12 }]}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                style={menu.item}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
              >
                <MenuGlyph kind={item.icon} />
                <Text style={[menu.itemText, item.danger && menu.dangerText]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, minHeight: 0, backgroundColor: "#07110d", overflow: "hidden" },
  talk: {
    position: "absolute",
    right: 16,
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
  talkOn: { backgroundColor: "#1e3a8a", borderColor: "#93c5fd" },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#0a1a12",
    pointerEvents: "none",
  },
  mic: { width: 18, height: 24, alignItems: "center" },
  micHead: { width: 8, height: 12, borderRadius: 4, backgroundColor: "white" },
  micArc: {
    width: 14,
    height: 8,
    marginTop: -4,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  micStem: { width: 2, height: 5, backgroundColor: "white" },
  micMuted: { backgroundColor: "#a8a29e" },
  micMutedBorder: { borderColor: "#a8a29e" },
  micSlash: {
    position: "absolute",
    width: 2,
    height: 26,
    backgroundColor: "#fca5a5",
    transform: [{ rotate: "35deg" }],
  },
});

const dock = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
    backgroundColor: "#100e0c",
    borderTopWidth: 1,
    borderTopColor: "#292524",
  },
  hole: { flexDirection: "row", gap: 3, minWidth: 52 },
  actions: { flex: 1, gap: 4, justifyContent: "center" },
  row: { flexDirection: "row", gap: 4 },
  button: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "#1c1917",
    borderWidth: 1,
    borderColor: "#44403c",
  },
  pressed: { opacity: 0.75 },
  fold: { borderColor: "#7f1d1d" },
  call: { borderColor: "#57534e" },
  raise: { borderColor: "#a16207" },
  allIn: { borderColor: "#a16207" },
  buttonText: { color: "#fafaf9", fontWeight: "600", fontSize: 12, letterSpacing: 0.4 },
  amount: {
    flex: 1.2,
    height: 32,
    borderWidth: 1,
    borderColor: "#44403c",
    borderRadius: 6,
    backgroundColor: "#0c0a09",
    color: "#fafaf9",
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  wait: { color: "#a8a29e", fontSize: 14, textAlign: "center" },
  shade: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 28 },
  prompt: { width: "100%", maxWidth: 320, backgroundColor: "#1c1917", borderRadius: 12, borderWidth: 1, borderColor: "#44403c", padding: 16, gap: 12, zIndex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#292524", alignItems: "center", justifyContent: "center" },
  stepText: { color: "#fafaf9", fontSize: 28, lineHeight: 32 },
  chips: { color: "#fafaf9", fontSize: 36, fontWeight: "700" },
  presets: { flexDirection: "row", gap: 6 },
  preset: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 6, backgroundColor: "#0c0a09", borderWidth: 1, borderColor: "#44403c" },
  presetOn: { borderColor: "#a16207" },
  presetLabel: { color: "#a8a29e", fontSize: 11 },
  presetValue: { color: "#fafaf9", fontSize: 14, fontWeight: "600", marginTop: 2 },
  promptHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  promptTitle: { color: "#fafaf9", fontSize: 16, fontWeight: "600" },
  confirm: { borderRadius: 6, paddingVertical: 10, alignItems: "center", backgroundColor: "#292524", borderWidth: 1, borderColor: "#a16207" },
});

const menu = StyleSheet.create({
  wrap: { alignItems: "flex-end" },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(12,10,9,0.78)",
    borderWidth: 1,
    borderColor: "rgba(246,211,107,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bar: { width: 16, height: 2, borderRadius: 1, backgroundColor: "#fafaf9" },
  backdrop: { flex: 1, direction: "ltr" },
  panel: {
    position: "absolute",
    zIndex: 6,
    minWidth: 180,
    backgroundColor: "rgba(28,25,23,0.96)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#44403c",
    overflow: "hidden",
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#292524" },
  itemText: { color: "white", fontSize: 15, fontWeight: "600" },
  dangerText: { color: "#fecaca" },
});
