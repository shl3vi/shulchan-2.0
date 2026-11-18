import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { betAnchor, FELT, RAIL, SEAT_CENTERS, SEAT_H, SEAT_TOP, SEAT_W, STAGE_H, STAGE_W } from "@/game/tableStage";
import type { Card } from "@/game/types";
import { ownChipJustPlayed, playOwnChip, playSfx, type Sfx } from "@/game/sfx";
import { t } from "@/i18n";

export type SeatSlot = {
  id: string;
  name: string;
  stack: number;
  bet: number;
  toAct: boolean;
  /** Time left to act when the snapshot was built. Only on the seat to act. */
  turnLeftMs?: number;
  /** The table's whole turn length, so the ring starts full. */
  turnTotalMs?: number;
  /** Server time of that snapshot, so the clock restarts on each one. */
  turnStamp?: number;
  isYou: boolean;
  /** Still has cards in the current hand. */
  inHand?: boolean;
  winner?: boolean;
  video?: ReactNode;
  cameraOn?: boolean;
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
    backgroundColor: "#fffdf7",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: Math.max(0.5, u(0.65)),
    borderColor: "rgba(96,72,48,0.35)",
    boxShadow: `0 ${u(2)}px ${u(3)}px rgba(0,0,0,0.48)`,
    elevation: 3,
  };
  if (back) {
    return (
      <View style={[box, { backgroundColor: "#18243f", borderWidth: u(1), borderColor: "#b9c7dd" }]}>
        <View
          style={{
            position: "absolute",
            top: u(2),
            left: u(2),
            right: u(2),
            bottom: u(2),
            borderRadius: u(2),
            borderWidth: Math.max(0.5, u(0.75)),
            borderColor: "rgba(255,255,255,0.28)",
          }}
        />
        <Text style={{ color: "#dbe7f6", fontSize: u(board ? 14 : 11) }}>♠</Text>
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
            elevation: 0,
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

const FLIP_MS = 260;
const FLIP_GAP_MS = 220;

/**
 * A card that turns over when it gets a new face: it shows its back, waits `delay`,
 * then flips. With flipOnMount it also flips the first time it is drawn.
 */
function FlipCard({
  card,
  size,
  scale,
  delay = 0,
  flipOnMount = false,
  sound = false,
}: {
  card?: Card;
  size: "board" | "hole";
  scale: number;
  delay?: number;
  flipOnMount?: boolean;
  /** Play the card flip sound as it turns over. */
  sound?: boolean;
}) {
  const face = card ? `${card.rank}${card.suit}` : "";
  const [shown, setShown] = useState(flipOnMount ? "" : face);
  const [flips, setFlips] = useState(0);
  const [turn] = useState(() => new Animated.Value(flipOnMount && face ? 0 : 1));
  if (face !== shown) {
    setShown(face);
    if (face) setFlips((count) => count + 1);
  }
  // Before paint, so the new face never shows for a frame before the flip.
  useLayoutEffect(() => {
    if (flips === 0) return;
    turn.setValue(0);
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(turn, { toValue: 1, duration: FLIP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    run.start();
    const timer = sound ? setTimeout(() => playSfx("cardFlip"), delay) : null;
    return () => {
      run.stop();
      if (timer) clearTimeout(timer);
    };
    // Only a new face starts a flip; a changed delay does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flips, turn]);
  if (!card) return <PlayingCard size={size} scale={scale} />;
  const squash = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.02, 1] });
  const lift = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });
  return (
    <Animated.View style={{ transform: [{ scaleX: squash }, { scaleY: lift }] }}>
      <Animated.View style={{ opacity: turn.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] }) }}>
        <PlayingCard card={card} size={size} scale={scale} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: turn.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [1, 1, 0, 0] }),
        }}
      >
        <PlayingCard back size={size} scale={scale} />
      </Animated.View>
    </Animated.View>
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
        boxShadow: `0 ${u(2)}px ${u(3)}px rgba(0,0,0,0.5)`,
        elevation: 3,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: u(3),
          left: u(3),
          right: u(3),
          bottom: u(3),
          borderRadius: u(CHIP / 2),
          borderWidth: Math.max(0.5, u(1)),
          borderColor: "rgba(255,255,255,0.32)",
        }}
      />
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

const CHIP_SLIDE_MS = 280;
const CHIP_FLIGHT_MS = 420;
/** Where the chips that go into the pot land: the pot under the board. */
const POT_SPOT = { x: FELT.x + FELT.w / 2, y: FELT.y + FELT.h / 2 + 31 };
/** The pot reaches the winners this long after a hand ends; the spotlight waits for it. */
const POT_PUSH_DELAY_MS = CHIP_SLIDE_MS + 60;
/** When the winner's seat starts to grow, after a hand ends. The applause starts with it. */
export const SPOTLIGHT_DELAY_MS = POT_PUSH_DELAY_MS + CHIP_FLIGHT_MS + 80;

/**
 * A seat's bet in front of it. A new or bigger bet slides out from the seat.
 * Drawn while the bet is zero too, so it can tell when a bet appears.
 */
function SlidingBet({ amount, dx, dy, scale, mine = false }: { amount: number; dx: number; dy: number; scale: number; mine?: boolean }) {
  const [last, setLast] = useState(amount);
  const [pushes, setPushes] = useState(0);
  const [slide] = useState(() => new Animated.Value(1));
  if (amount !== last) {
    setLast(amount);
    if (amount > last) setPushes((count) => count + 1);
  }
  useLayoutEffect(() => {
    if (pushes === 0) return;
    // Your own bet already made its sound when you tapped.
    if (!(mine && ownChipJustPlayed())) playSfx("chip");
    slide.setValue(0);
    const run = Animated.timing(slide, { toValue: 1, duration: CHIP_SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [pushes, slide, mine]);
  if (amount <= 0) return null;
  return (
    <Animated.View
      style={{
        opacity: slide.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
        ],
      }}
    >
      <BetChip amount={amount} scale={scale} />
    </Animated.View>
  );
}

type ChipTrip = {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  amount: number;
  delay: number;
  ms: number;
  /** Played when this chip starts moving. One chip of a batch carries it. */
  sound?: Sfx;
};

/** One chip moving across the table, in stage pixels, then gone. */
function ChipFlight({ trip, scale, onDone }: { trip: ChipTrip; scale: number; onDone: (id: number) => void }) {
  const [move] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const run = Animated.sequence([
      Animated.delay(trip.delay),
      Animated.timing(move, { toValue: 1, duration: trip.ms, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(() => done.current(trip.id));
    const sound = trip.sound;
    const timer = sound ? setTimeout(() => playSfx(sound), trip.delay) : null;
    return () => {
      run.stop();
      if (timer) clearTimeout(timer);
    };
  }, [move, trip]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (trip.from.x - CHIP / 2) * scale,
        top: (trip.from.y - CHIP / 2) * scale,
        zIndex: 7,
        opacity: move.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateX: move.interpolate({ inputRange: [0, 1], outputRange: [0, (trip.to.x - trip.from.x) * scale] }) },
          { translateY: move.interpolate({ inputRange: [0, 1], outputRange: [0, (trip.to.y - trip.from.y) * scale] }) },
        ],
      }}
    >
      <BetChip amount={trip.amount} scale={scale} />
    </Animated.View>
  );
}

function ShownCards({ cards, scale }: { cards: Card[]; scale: number }) {
  const u = (n: number) => n * scale;
  return (
    <View style={{ flexDirection: "row", gap: u(2) }}>
      {cards.slice(0, 2).map((card, index) => (
        <FlipCard key={index} card={card} size="hole" scale={scale} flipOnMount sound delay={index * 140} />
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

const CURTAIN_FOLDS = ["#800000", "#b30000", "#660000", "#cc0000", "#4d0000"];

function SeatCurtain({ open }: { open: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const laidOut = useRef(false);

  useEffect(() => {
    if (width === 0) return;
    const to = open ? 1 : 0;
    if (!laidOut.current) {
      laidOut.current = true;
      if (!open) {
        progress.setValue(0);
        return;
      }
    }
    Animated.timing(progress, {
      toValue: to,
      duration: 1200,
      easing: Easing.bezier(0.77, 0, 0.175, 1),
      useNativeDriver: true,
    }).start();
  }, [open, progress, width]);

  const half = width / 2;
  const left = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -half] });
  const right = progress.interpolate({ inputRange: [0, 1], outputRange: [0, half] });

  return (
    <View
      pointerEvents="none"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, overflow: "hidden" }}
    >
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "50%", flexDirection: "row", transform: [{ translateX: left }] }}>
        {CURTAIN_FOLDS.map((color) => (
          <View key={`l-${color}`} style={{ flex: 1, backgroundColor: color }} />
        ))}
        <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 3, backgroundColor: "#000", opacity: 0.3 }} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "50%", flexDirection: "row", transform: [{ translateX: right }] }}>
        {CURTAIN_FOLDS.map((color) => (
          <View key={`r-${color}`} style={{ flex: 1, backgroundColor: color }} />
        ))}
        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 3, backgroundColor: "#000", opacity: 0.3 }} />
      </Animated.View>
    </View>
  );
}

/** Seconds left for the seat to act. The server acts when it reaches zero. Remount per snapshot. */
/** Used when the server does not send the table's turn length. */
const DEFAULT_TURN_MS = 30_000;

/**
 * A line around the video frame that drains clockwise from the top middle as the
 * turn runs out, gold until the last 10 seconds, then red.
 */
function TurnRing({ leftMs, totalMs, scale }: { leftMs: number; totalMs: number; scale: number }) {
  const u = (n: number) => n * scale;
  const [box, setBox] = useState({ w: u(60), h: u(92) });
  const { w, h } = box;
  const t = u(3);
  const perimeter = 2 * (w + h);
  // Share of the full turn still left, 1 to 0, so a new layout size does not restart it.
  const [left] = useState(() => new Animated.Value(Math.min(1, leftMs / totalMs)));
  useEffect(() => {
    const run = Animated.timing(left, { toValue: 0, duration: leftMs, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [leftMs, left]);
  const urgentAt = 10_000 / totalMs;
  const color = left.interpolate({
    inputRange: [urgentAt - 0.001, urgentAt],
    outputRange: ["#ef4444", "#f6d36b"],
    extrapolate: "clamp",
  });
  // Segments in clockwise order from the top middle: [start, size].
  const segments: [number, number][] = [
    [0, w / 2],
    [w / 2, h],
    [w / 2 + h, w],
    [w * 1.5 + h, h],
    [w * 1.5 + 2 * h, w / 2],
  ];
  const part = (index: number) => {
    const [start, size] = segments[index];
    return left.interpolate({
      inputRange: [start / perimeter, (start + size) / perimeter],
      outputRange: [0, size],
      extrapolate: "clamp",
    });
  };
  const bar = { position: "absolute" as const, backgroundColor: color };
  return (
    <View
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== w || height !== h) setBox({ w: width, h: height });
      }}
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 4 }}
    >
      <Animated.View style={[bar, { top: 0, left: w / 2, height: t, width: part(0) }]} />
      <Animated.View style={[bar, { top: 0, right: 0, width: t, height: part(1) }]} />
      <Animated.View style={[bar, { bottom: 0, right: 0, height: t, width: part(2) }]} />
      <Animated.View style={[bar, { bottom: 0, left: 0, width: t, height: part(3) }]} />
      <Animated.View style={[bar, { top: 0, left: 0, height: t, width: part(4) }]} />
    </View>
  );
}

function TurnClock({ leftMs, scale }: { leftMs: number; scale: number }) {
  const u = (n: number) => n * scale;
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((leftMs - (now - start)) / 1000));
  const urgent = seconds <= 10;
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={t("turnSecondsLeft", { seconds })}
      style={{
        position: "absolute",
        top: u(4),
        right: u(4),
        minWidth: u(22),
        height: u(18),
        paddingHorizontal: u(4),
        borderRadius: u(9),
        backgroundColor: urgent ? "#dc2626" : "rgba(12,10,9,0.85)",
        borderWidth: u(1),
        borderColor: urgent ? "#fecaca" : "#f6d36b",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      <Text style={{ color: urgent ? "#fff" : "#f6d36b", fontSize: u(10), fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {seconds}
      </Text>
    </View>
  );
}

function SeatView({ player, scale }: { player?: SeatSlot; scale: number }) {
  const u = (n: number) => n * scale;
  const occupied = player != null;
  const cameraOn = player?.cameraOn === true;
  const videoRef = useRef(player?.video);
  if (player?.video) videoRef.current = player.video;
  const [showVideo, setShowVideo] = useState(cameraOn);
  const ring = player?.toAct ? "#f6d36b" : occupied ? "#44403c" : "#57534e";

  useEffect(() => {
    if (cameraOn) {
      setShowVideo(true);
      return;
    }
    const timer = setTimeout(() => setShowVideo(false), 1200);
    return () => clearTimeout(timer);
  }, [cameraOn]);

  const face = (
    <>
      {occupied && showVideo && videoRef.current ? (
        videoRef.current
      ) : (
        <Text style={{ color: occupied ? "#fafaf9" : "#78716c", fontSize: u(16), fontWeight: "700" }}>
          {player ? player.name.trim().slice(0, 1).toUpperCase() : "+"}
        </Text>
      )}
      {occupied ? <SeatCurtain open={cameraOn} /> : null}
      {player?.toAct && player.turnLeftMs != null ? (
        <>
          <TurnRing key={`ring-${player.turnStamp}`} leftMs={player.turnLeftMs} totalMs={player.turnTotalMs ?? DEFAULT_TURN_MS} scale={scale} />
          <TurnClock key={player.turnStamp} leftMs={player.turnLeftMs} scale={scale} />
        </>
      ) : null}
    </>
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
              boxShadow: player?.toAct
                ? `0 0 ${u(9)}px rgba(246,211,107,0.52)`
                : `0 ${u(4)}px ${u(7)}px rgba(0,0,0,0.58)`,
              elevation: player?.toAct ? 7 : 4,
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
          boxShadow: `0 ${u(2)}px ${u(4)}px rgba(0,0,0,0.45)`,
          elevation: 2,
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
  // Cards that arrive together (an all-in runs out the board) flip one after another.
  const [seen, setSeen] = useState(community.length);
  const [revealFrom, setRevealFrom] = useState(community.length);
  if (community.length !== seen) {
    setRevealFrom(Math.min(seen, community.length));
    setSeen(community.length);
  }
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
        backgroundColor: "#28150d",
        borderWidth: Math.max(1, u(2)),
        borderColor: "#765033",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 ${u(13)}px ${u(22)}px rgba(0,0,0,0.68)`,
        elevation: 12,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: u(4),
          right: u(4),
          top: u(4),
          bottom: u(4),
          borderRadius: radius,
          borderWidth: Math.max(1, u(1.5)),
          borderColor: "rgba(226,175,110,0.35)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: u(8),
          right: u(8),
          top: u(8),
          height: "42%",
          borderRadius: radius,
          backgroundColor: "rgba(255,207,145,0.055)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: u(RAIL - 3),
          top: u(RAIL - 3),
          width: u(FELT.w + 6),
          height: u(FELT.h + 6),
          borderRadius: u(FELT.w / 2),
          backgroundColor: "#100a07",
          boxShadow: `inset 0 ${u(2)}px ${u(4)}px rgba(0,0,0,0.8)`,
        }}
      />
      <View
        style={{
          width: u(FELT.w),
          height: u(FELT.h),
          borderRadius: u(FELT.w / 2),
          backgroundColor: "#116c3b",
          borderWidth: Math.max(1, u(2)),
          borderColor: "#1b8b50",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "5%",
            top: "4%",
            width: "90%",
            height: "42%",
            borderRadius: u(FELT.h),
            backgroundColor: "rgba(82,190,119,0.11)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "9%",
            top: "12%",
            width: "82%",
            height: "76%",
            borderRadius: u(FELT.h),
            borderWidth: Math.max(1, u(1)),
            borderColor: "rgba(194,238,207,0.12)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "17%",
            top: "20%",
            width: "66%",
            height: "60%",
            borderRadius: u(FELT.h),
            backgroundColor: "rgba(12,91,49,0.2)",
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
              <FlipCard
                key={index}
                card={community[index]}
                size="board"
                scale={scale}
                delay={Math.max(0, index - revealFrom) * FLIP_GAP_MS}
                sound
              />
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

const DEAL_STAGGER_MS = 70;
const DEAL_FLIGHT_MS = 260;
const DEAL_FROM = { x: FELT.x + FELT.w / 2, y: FELT.y + FELT.h / 2 };
/** Hole cards at the seats are drawn a little smaller than in your hand. */
const TUCK_SCALE = 0.9;

/** Seats in deal order: clockwise from the seat left of you, you last, two times around. */
function dealOrder(targets: number[]) {
  const round = [...targets].sort((a, b) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b));
  return [...round.map((visual) => ({ visual, card: 0 as const })), ...round.map((visual) => ({ visual, card: 1 as const }))];
}

/** When your two cards land, in ms after the deal starts, for a hand with `players` dealt in. */
export function heroDealDelays(players: number) {
  const n = Math.max(1, players);
  return [(n - 1) * DEAL_STAGGER_MS + DEAL_FLIGHT_MS, (2 * n - 1) * DEAL_STAGGER_MS + DEAL_FLIGHT_MS];
}

/** Where a seat's face-down cards sit, in stage pixels. Yours go to your seat and fade. */
function tuckSpot(visual: number, card: 0 | 1) {
  const seat = SEAT_CENTERS[visual] ?? SEAT_CENTERS[0];
  if (visual === 0) return { x: seat.x + (card ? 7 : -7), y: seat.y, rot: card ? 6 : -6 };
  const side = DEAL_FROM.x >= seat.x ? 1 : -1;
  return { x: seat.x + side * 30 + (card ? 5 : -5), y: seat.y + 34, rot: card ? 9 : -7 };
}

const TUCK_W = 20;
const TUCK_H = 28;

function TuckedCards({ visual, scale }: { visual: number; scale: number }) {
  const s = scale * TUCK_SCALE;
  return (
    <>
      {([0, 1] as const).map((card) => {
        const spot = tuckSpot(visual, card);
        return (
          <View
            key={card}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: spot.x * scale - (TUCK_W * s) / 2,
              top: spot.y * scale - (TUCK_H * s) / 2,
              zIndex: 4,
              transform: [{ rotate: `${spot.rot}deg` }],
            }}
          >
            <PlayingCard back size="hole" scale={s} />
          </View>
        );
      })}
    </>
  );
}

/** Card backs flying from the middle of the felt to each seat in the hand, one at a time. */
function DealLayer({ targets, scale, onDone }: { targets: number[]; scale: number; onDone: () => void }) {
  const [cards] = useState(() => dealOrder(targets));
  const [flights] = useState(() => cards.map(() => new Animated.Value(0)));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const run = Animated.stagger(
      DEAL_STAGGER_MS,
      flights.map((flight) =>
        Animated.timing(flight, { toValue: 1, duration: DEAL_FLIGHT_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ),
    );
    run.start(({ finished }) => {
      if (finished) done.current();
    });
    // A card flick as each card leaves the middle.
    const timers = flights.map((_, index) => setTimeout(() => playSfx("cardDeal"), index * DEAL_STAGGER_MS));
    return () => {
      run.stop();
      timers.forEach(clearTimeout);
    };
  }, [flights]);
  const s = scale * TUCK_SCALE;
  return (
    <>
      {cards.map((entry, index) => {
        const flight = flights[index]!;
        const spot = tuckSpot(entry.visual, entry.card);
        const hero = entry.visual === 0;
        return (
          <Animated.View
            key={`${entry.visual}-${entry.card}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: DEAL_FROM.x * scale - (TUCK_W * s) / 2,
              top: DEAL_FROM.y * scale - (TUCK_H * s) / 2,
              zIndex: 6,
              opacity: flight.interpolate({
                inputRange: [0, 0.02, 0.85, 1],
                outputRange: [0, 1, 1, hero ? 0 : 1],
              }),
              transform: [
                { translateX: flight.interpolate({ inputRange: [0, 1], outputRange: [0, (spot.x - DEAL_FROM.x) * scale] }) },
                { translateY: flight.interpolate({ inputRange: [0, 1], outputRange: [0, (spot.y - DEAL_FROM.y) * scale] }) },
                { rotate: flight.interpolate({ inputRange: [0, 1], outputRange: [`${spot.rot - 160}deg`, `${spot.rot}deg`] }) },
                { scale: flight.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
              ],
            }}
          >
            <PlayingCard back size="hole" scale={s} />
          </Animated.View>
        );
      })}
    </>
  );
}

const SPOTLIGHT_ZOOM = 2.1;
const SPOTLIGHT_HOLD_MS = 3000;

/** Moves the winner's seat to the middle of the table, enlarged, then back to its place. */
function Spotlight({
  active,
  delay = 0,
  scale,
  dx,
  dy,
  left,
  top,
  children,
}: {
  active: boolean;
  /** Wait this long before lifting, so the pot reaches the winner first. */
  delay?: number;
  scale: number;
  dx: number;
  dy: number;
  left: number;
  top: number;
  children: ReactNode;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const [finished, setFinished] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setFinished(false);
  }
  const lifted = active && !finished;
  useEffect(() => {
    if (!active) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(progress, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.delay(SPOTLIGHT_HOLD_MS),
      Animated.timing(progress, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(({ finished: done }) => {
      if (done) setFinished(true);
    });
    return () => run.stop();
    // The delay is read when the spotlight starts; changing it later does nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, progress]);
  // The video frame's center, measured from the seat widget's top left corner.
  const fx = (SEAT_W / 2) * scale;
  const fy = SEAT_TOP * scale;
  const zoom = progress.interpolate({ inputRange: [0, 1], outputRange: [1, SPOTLIGHT_ZOOM] });
  return (
    <>
      {lifted ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            opacity: progress,
            zIndex: 9,
          }}
        />
      ) : null}
      <Animated.View
        style={{
          position: "absolute",
          left,
          top,
          zIndex: lifted ? 10 : 3,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            // Scale around the video frame instead of the widget's middle.
            { translateX: fx - (SEAT_W * scale) / 2 },
            { translateY: fy - (SEAT_H * scale) / 2 },
            { scale: zoom },
            { translateX: -(fx - (SEAT_W * scale) / 2) },
            { translateY: -(fy - (SEAT_H * scale) / 2) },
          ],
        }}
      >
        {children}
      </Animated.View>
    </>
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
  onSeat,
}: {
  seats: Array<SeatSlot | undefined>;
  shown: Card[][];
  community: Card[];
  pot: number;
  round: string | null;
  winners?: { seat?: number; name: string; amount: number }[];
  onDeal?: () => void;
  onSeat?: (seat: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = size.width > 0 && size.height > 0 ? Math.min(size.width / STAGE_W, size.height / STAGE_H) : 0;
  const heroSeat = seats.findIndex((seat) => seat?.isYou);
  const hero = heroSeat >= 0 ? heroSeat : 0;
  const u = (n: number) => n * scale;
  const visualOf = (seatIndex: number) => (seatIndex - hero + SEAT_CENTERS.length) % SEAT_CENTERS.length;
  const dealtIn = seats.flatMap((seat, seatIndex) => (seat?.inHand ? [visualOf(seatIndex)] : []));
  // A new hand starts the deal. Joining in the middle of a hand does not.
  const [deal, setDeal] = useState<{ id: number; targets: number[] } | null>(null);
  const [lastRound, setLastRound] = useState(round);
  // Chips moving: bets into the pot when a betting round closes, the pot to the winners when a hand ends.
  const [trips, setTrips] = useState<ChipTrip[]>([]);
  const [tripId, setTripId] = useState(0);
  const bets = Array.from({ length: SEAT_CENTERS.length }, (_, seatIndex) => seats[seatIndex]?.bet ?? 0);
  const [lastBets, setLastBets] = useState(bets);
  const betsChanged = bets.some((bet, index) => bet !== lastBets[index]);
  if (betsChanged || lastRound !== round) {
    const next: ChipTrip[] = [];
    let id = tripId;
    if (betsChanged) {
      setLastBets(bets);
      lastBets.forEach((before, seatIndex) => {
        if (before <= 0 || (bets[seatIndex] ?? 0) > 0) return;
        const from = betAnchor(visualOf(seatIndex));
        next.push({ id: (id += 1), from, to: POT_SPOT, amount: before, delay: 0, ms: CHIP_SLIDE_MS });
      });
    }
    if (lastRound !== round) {
      setLastRound(round);
      if (lastRound == null && round != null && dealtIn.length > 0) setDeal({ id: (deal?.id ?? 0) + 1, targets: dealtIn });
      else if (round == null && deal) setDeal(null);
      if (lastRound != null && round == null) {
        for (const winner of winners) {
          if (winner.seat == null || winner.amount <= 0) continue;
          const to = SEAT_CENTERS[visualOf(winner.seat)] ?? SEAT_CENTERS[0];
          next.push({ id: (id += 1), from: POT_SPOT, to, amount: winner.amount, delay: POT_PUSH_DELAY_MS, ms: CHIP_FLIGHT_MS });
        }
      }
    }
    // One sound per batch: bets into the pot, then the pot to the winners.
    const collect = next.find((trip) => trip.to === POT_SPOT);
    if (collect) collect.sound = "chipsCollect";
    const push = next.find((trip) => trip.from === POT_SPOT);
    if (push) push.sound = "chipsPush";
    if (next.length > 0) {
      setTripId(id);
      setTrips([...trips, ...next]);
    }
  }

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
      <View style={styles.roomGlow} />
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
            if (!player) return null;
            const anchor = betAnchor(visual);
            return (
              <View
                key={`bet-${visual}`}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: u(anchor.x - CHIP / 2),
                  top: u(anchor.y - CHIP / 2),
                  zIndex: 2,
                }}
              >
                <SlidingBet amount={player.bet} dx={u(center.x - anchor.x)} dy={u(center.y - anchor.y)} scale={scale} mine={player.isYou} />
              </View>
            );
          })}
          {round != null && !deal
            ? SEAT_CENTERS.map((_, visual) => {
                const player = seats[(hero + visual) % SEAT_CENTERS.length];
                if (visual === 0 || !player?.inHand || (shown[(hero + visual) % SEAT_CENTERS.length]?.length ?? 0) > 0) return null;
                return <TuckedCards key={`tuck-${visual}`} visual={visual} scale={scale} />;
              })
            : null}
          {deal ? <DealLayer key={deal.id} targets={deal.targets} scale={scale} onDone={() => setDeal(null)} /> : null}
          {trips.map((trip) => (
            <ChipFlight key={trip.id} trip={trip} scale={scale} onDone={(id) => setTrips((list) => list.filter((entry) => entry.id !== id))} />
          ))}
          {SEAT_CENTERS.map((center, visual) => {
            const seatIndex = (hero + visual) % SEAT_CENTERS.length;
            const player = seats[seatIndex];
            return (
              <Spotlight
                key={`seat-${visual}`}
                active={player?.winner === true}
                delay={SPOTLIGHT_DELAY_MS}
                scale={scale}
                dx={u(STAGE_W / 2 - center.x)}
                dy={u(STAGE_H / 2 - center.y)}
                left={u(center.x - SEAT_W / 2)}
                top={u(center.y - SEAT_TOP)}
              >
                <Pressable disabled={!player || !onSeat} onPress={() => onSeat?.(seatIndex)}>
                  <SeatView player={player} scale={scale} />
                </Pressable>
              </Spotlight>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function TalkButton({ on, onTalk }: { on: boolean; onTalk: (on: boolean) => void }) {
  const held = useRef(false);
  return (
    <Pressable
      style={[styles.talk, on && styles.talkOn]}
      delayLongPress={280}
      onPress={() => {
        if (held.current) return;
        onTalk(!on);
      }}
      onLongPress={() => {
        held.current = true;
        onTalk(true);
      }}
      onPressOut={() => {
        if (!held.current) return;
        onTalk(false);
        setTimeout(() => {
          held.current = false;
        }, 0);
      }}
    >
      <MicIcon muted={!on} active={on} />
    </Pressable>
  );
}

function MicIcon({ muted, active }: { muted: boolean; active: boolean }) {
  return (
    <View style={styles.mic}>
      <View style={[styles.micHead, active && styles.micActive, muted && styles.micMuted]} />
      <View style={[styles.micArc, active && styles.micActiveBorder, muted && styles.micMutedBorder]} />
      <View style={[styles.micStem, active && styles.micActive, muted && styles.micMuted]} />
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
  idleText,
  dealDelays,
}: {
  actions: PokerAction[];
  yourTurn: boolean;
  chipRange?: { min: number; max: number } | null;
  step: number;
  cards: Card[];
  onAction: (action: PokerAction, amount?: number) => void;
  /** Shown when it is not your turn. Omitted between hands, when Deal is the next step. */
  idleText?: string | null;
  /** When the deal reaches you, so your cards turn over as they land. */
  dealDelays?: number[];
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
            <FlipCard key={index} card={card} size="board" scale={1} flipOnMount delay={dealDelays?.[index] ?? index * 140} />
          ))}
        </View>
        <View style={dock.actions}>
          {yourTurn ? (
            <View style={dock.row}>
              {quiet.map((action) => (
                <Pressable
                  key={action}
                  style={({ pressed }) => [dock.button, actionStyle(action), pressed && dock.pressed]}
                  onPress={() => {
                    if (action === "call") playOwnChip();
                    onAction(action);
                  }}
                >
                  <Text style={dock.buttonText}>{t(action)}</Text>
                </Pressable>
              ))}
              {chipRange ? (
                <Pressable
                  style={({ pressed }) => [dock.button, dock.allIn, pressed && dock.pressed]}
                  onPress={() => {
                    if (!sized[0]) return;
                    playOwnChip();
                    onAction(sized[0], chipRange.max);
                  }}
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
            idleText ? <Text style={dock.wait}>{idleText}</Text> : null
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
                playOwnChip();
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

type MenuIcon = "info" | "share" | "leave" | "stats" | "admin" | "buy" | "restart" | "pause";

function MenuGlyph({ kind }: { kind?: MenuIcon }) {
  if (kind === "info") return <Ionicons name="information-circle-outline" size={18} color="#c8ceff" />;
  if (kind === "share") return <Ionicons name="share-outline" size={18} color="#c8ceff" />;
  if (kind === "leave") return <Ionicons name="warning" size={18} color="#f87171" />;
  if (kind === "admin") return <Ionicons name="shield-checkmark-outline" size={18} color="#c8ceff" />;
  if (kind === "buy") return <Ionicons name="add-circle-outline" size={18} color="#c8ceff" />;
  if (kind === "restart") return <Ionicons name="refresh" size={18} color="#c8ceff" />;
  if (kind === "pause") return <Ionicons name="pause-circle-outline" size={18} color="#c8ceff" />;
  return <Ionicons name="stats-chart" size={18} color="#c8ceff" />;
}

export function TableMenu({
  items,
}: {
  items: { label: string; onPress: () => void; danger?: boolean; icon?: MenuIcon }[];
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
  room: { flex: 1, minHeight: 0, backgroundColor: "#090b16", overflow: "hidden" },
  talk: {
    position: "absolute",
    right: 16,
    bottom: 16,
    zIndex: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(20, 23, 42, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  talkOn: { backgroundColor: "#a8b2ff", borderColor: "#c8ceff" },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#090b16",
    pointerEvents: "none",
  },
  roomGlow: {
    position: "absolute",
    width: "118%",
    height: "72%",
    left: "-9%",
    top: "12%",
    borderRadius: 999,
    backgroundColor: "rgba(92, 77, 216, 0.16)",
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
  micActive: { backgroundColor: "#171b35" },
  micActiveBorder: { borderColor: "#171b35" },
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
    backgroundColor: "rgba(20, 23, 42, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(168, 178, 255, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bar: { width: 16, height: 2, borderRadius: 1, backgroundColor: "#c8ceff" },
  backdrop: { flex: 1, backgroundColor: "rgba(5, 6, 14, 0.24)", ...(Platform.OS === "web" ? null : { direction: "ltr" as const }) },
  panel: {
    position: "absolute",
    zIndex: 6,
    minWidth: 180,
    backgroundColor: "rgba(20, 23, 42, 0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.2)",
    overflow: "hidden",
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(205, 210, 255, 0.1)" },
  itemText: { color: "#f7f7fc", fontSize: 15, fontWeight: "600" },
  dangerText: { color: "#fecaca" },
});
