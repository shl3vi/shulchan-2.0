import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
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
    // Paper lit from above: bright at the top, a touch warmer where it meets the felt.
    backgroundImage: "linear-gradient(172deg, #ffffff 0%, #fbf8f1 55%, #eee6d6 100%)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: Math.max(0.5, u(0.65)),
    borderColor: "rgba(96,72,48,0.35)",
    // A tight contact shadow under the card and a soft one around it.
    boxShadow: `0 ${u(1)}px ${u(1)}px rgba(0,0,0,0.4), 0 ${u(3)}px ${u(6)}px rgba(0,0,0,0.38)`,
    elevation: 3,
  };
  if (back) {
    return (
      <View
        style={[
          box,
          {
            backgroundColor: "#18243f",
            backgroundImage: "linear-gradient(160deg, #2b4170 0%, #1a2847 52%, #101a30 100%)",
            borderWidth: u(1),
            borderColor: "#b9c7dd",
          },
        ]}
      >
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
            // An empty slot is pressed into the felt rather than drawn on it.
            backgroundColor: "rgba(0,0,0,0.14)",
            backgroundImage: "none",
            borderWidth: u(1),
            borderColor: "rgba(255,255,255,0.13)",
            boxShadow: `inset 0 ${u(1.5)}px ${u(3)}px rgba(0,0,0,0.4)`,
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

/** Half of one slow breath of the lamp over the table. */
const LAMP_BREATH_MS = 4600;
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

/**
 * A chip seen from slightly above: a domed face lit from the top, and a solid
 * darker band under it for the chip's edge, then its shadow on the felt.
 */
function chipLook(size: number, scale: number) {
  const u = (n: number) => n * scale;
  return {
    width: u(size),
    height: u(size),
    borderRadius: u(size / 2),
    backgroundColor: "#b45309",
    backgroundImage: "radial-gradient(circle farthest-side at 50% 30%, #e08a2c 0%, #b45309 62%, #8f3f07 100%)",
    borderWidth: Math.max(1, u(size > 18 ? 2 : 1.5)),
    borderColor: "#f3dfa6",
    boxShadow: `0 ${u(1.6)}px 0 #6a2e05, 0 ${u(2.5)}px ${u(4)}px rgba(0,0,0,0.55)`,
    elevation: 3,
  } as const;
}

function BetChip({ amount, scale }: { amount: number; scale: number }) {
  const u = (n: number) => n * scale;
  return (
    <View
      style={{
        ...chipLook(CHIP, scale),
        alignItems: "center",
        justifyContent: "center",
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
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2600,
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
    // Polished gold with a warm glow around it, and a soft glint travelling round the frame.
    <View
      style={{
        width: w,
        height: h,
        borderRadius: u(8),
        boxShadow: `0 0 ${u(8)}px rgba(246,211,107,0.55), 0 0 ${u(22)}px rgba(246,211,107,0.25), 0 ${u(6)}px ${u(12)}px rgba(0,0,0,0.5)`,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: u(8),
          overflow: "hidden",
          backgroundColor: "#f6d36b",
          backgroundImage: "linear-gradient(155deg, #fff4c8 0%, #f6d36b 32%, #dcab4c 64%, #f8dd92 100%)",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: span,
            height: span,
            left: (w - span) / 2,
            top: (h - span) / 2,
            transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 40%, rgba(255,252,236,0.95) 50%, rgba(255,255,255,0) 60%, rgba(255,255,255,0) 100%)",
          }}
        />
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
            boxShadow: `inset 0 0 ${u(4)}px rgba(0,0,0,0.6)`,
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const CURTAIN_FOLDS = ["#800000", "#b30000", "#660000", "#cc0000", "#4d0000"];

function SeatCurtain({ open }: { open: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));
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

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * A rounded rectangle traced clockwise from the top middle, `inset` in from a w×h box,
 * with its length, so a dash along it can show how much of the loop is left.
 */
function roundedLoop(w: number, h: number, inset: number, radius: number) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const d = [
    `M ${w / 2} ${y0}`,
    `H ${x1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `V ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H ${x0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `V ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    "Z",
  ].join(" ");
  const length = 2 * (x1 - x0 - 2 * r) + 2 * (y1 - y0 - 2 * r) + 2 * Math.PI * r;
  return { d, length };
}

/**
 * The turn clock drawn around the video frame: one unbroken line that follows the frame's
 * rounded corners and runs out clockwise from the top middle, over a faint track of the
 * whole loop. Warm gold with a soft glow, then coral for the last 10 seconds.
 */
function TurnRing({ leftMs, totalMs, scale }: { leftMs: number; totalMs: number; scale: number }) {
  const u = (n: number) => n * scale;
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [box, setBox] = useState({ w: u(60), h: u(92) });
  const { w, h } = box;
  const stroke = u(3);
  const { d, length } = roundedLoop(w, h, stroke / 2, u(6) - stroke / 2);
  // Share of the full turn still left, 1 to 0, so a new layout size does not restart it.
  const [left] = useState(() => new Animated.Value(Math.min(1, leftMs / totalMs)));
  useEffect(() => {
    const run = Animated.timing(left, { toValue: 0, duration: leftMs, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [leftMs, left]);
  const urgentAt = 10_000 / totalMs;
  const offset = left.interpolate({ inputRange: [0, 1], outputRange: [length, 0], extrapolate: "clamp" });
  const calm = left.interpolate({ inputRange: [urgentAt - 0.001, urgentAt], outputRange: [0, 1], extrapolate: "clamp" });
  const urgent = left.interpolate({ inputRange: [urgentAt - 0.001, urgentAt], outputRange: [1, 0], extrapolate: "clamp" });
  const line = (paint: string, width: number, opacity: Animated.AnimatedInterpolation<number>, glow: boolean) => (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={paint}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={[length, length]}
      strokeDashoffset={offset}
      opacity={glow ? Animated.multiply(opacity, 0.28) : opacity}
    />
  );
  return (
    <View
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== w || height !== h) setBox({ w: width, h: height });
      }}
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 4 }}
    >
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={`gold${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#fff3c4" />
            <Stop offset="0.45" stopColor="#f6d36b" />
            <Stop offset="1" stopColor="#e3a53c" />
          </LinearGradient>
          <LinearGradient id={`coral${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#ffc2b8" />
            <Stop offset="0.5" stopColor="#f87171" />
            <Stop offset="1" stopColor="#dc2626" />
          </LinearGradient>
        </Defs>
        <Path d={d} fill="none" stroke="rgba(255,244,214,0.13)" strokeWidth={stroke} />
        {line(`url(#gold${id})`, stroke * 2.6, calm, true)}
        {line(`url(#gold${id})`, stroke, calm, false)}
        {line(`url(#coral${id})`, stroke * 2.6, urgent, true)}
        {line(`url(#coral${id})`, stroke, urgent, false)}
      </Svg>
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
  // The last video stays on the tile while the curtain closes after the camera goes off.
  const [lastVideo, setLastVideo] = useState(player?.video);
  if (player?.video && player.video !== lastVideo) setLastVideo(player.video);
  const video = player?.video ?? lastVideo;
  const [showVideo, setShowVideo] = useState(cameraOn);
  if (cameraOn && !showVideo) setShowVideo(true);
  // While the turn clock runs, the clock is the frame; the border underneath steps back.
  const timed = player?.toAct === true && player.turnLeftMs != null;
  const ring = timed ? "#3a332c" : player?.toAct ? "#f6d36b" : occupied ? "#4a4440" : "rgba(214,211,209,0.2)";

  useEffect(() => {
    if (cameraOn) return;
    const timer = setTimeout(() => setShowVideo(false), 1200);
    return () => clearTimeout(timer);
  }, [cameraOn]);

  const face = (
    <>
      {occupied && showVideo && video ? (
        video
      ) : (
        <Text style={{ color: occupied ? "#fafaf9" : "rgba(214,211,209,0.38)", fontSize: u(16), fontWeight: occupied ? "700" : "400" }}>
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
              borderWidth: occupied ? u(2) : Math.max(1, u(1.2)),
              borderStyle: occupied ? "solid" : "dashed",
              borderColor: ring,
              // A taken seat is a lit tile; an open one is a quiet outline the room shows through.
              backgroundColor: occupied ? "#1c1917" : "rgba(13,13,19,0.45)",
              backgroundImage: occupied ? "linear-gradient(180deg, #2c2724 0%, #1c1917 52%, #121010 100%)" : "none",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: player?.toAct
                ? `0 0 ${u(10)}px rgba(246,211,107,0.5), inset 0 ${u(1)}px 0 rgba(255,255,255,0.1)`
                : occupied
                  ? `0 ${u(1)}px ${u(1)}px rgba(0,0,0,0.5), 0 ${u(6)}px ${u(12)}px rgba(0,0,0,0.5), inset 0 ${u(1)}px 0 rgba(255,255,255,0.08)`
                  : "none",
              elevation: player?.toAct ? 7 : occupied ? 4 : 0,
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
          backgroundColor: occupied ? "rgba(12,10,9,0.92)" : "transparent",
          backgroundImage: occupied ? "linear-gradient(180deg, rgba(40,36,33,0.96) 0%, rgba(14,12,11,0.96) 100%)" : "none",
          borderWidth: occupied ? u(1) : 0,
          borderColor: player?.toAct ? "#e8c98a" : "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: occupied ? `0 ${u(3)}px ${u(6)}px rgba(0,0,0,0.45), inset 0 ${u(1)}px 0 rgba(255,255,255,0.07)` : "none",
          elevation: occupied ? 2 : 0,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: occupied ? "#fafaf9" : "rgba(214,211,209,0.5)",
            fontSize: u(10),
            lineHeight: u(12),
            fontWeight: occupied ? "700" : "600",
            textShadowColor: "rgba(0,0,0,0.8)",
            textShadowOffset: { width: 0, height: u(1) },
            textShadowRadius: u(3),
          }}
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
  // The lamp over the table breathes very slowly, so the room never looks frozen.
  const [lamp] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lamp, { toValue: 1, duration: LAMP_BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lamp, { toValue: 0, duration: LAMP_BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [lamp]);
  const railW = FELT.w + RAIL * 2;
  const railH = FELT.h + RAIL * 2;
  const radius = u(railW / 2);
  const feltRadius = u(FELT.w / 2);
  return (
    <View
      style={{
        position: "absolute",
        left: u(FELT.x - RAIL),
        top: u(FELT.y - RAIL),
        width: u(railW),
        height: u(railH),
        borderRadius: radius,
        // Padded leather rail, lit from above: warm on top, falling into shadow at the bottom.
        backgroundColor: "#28150d",
        backgroundImage: "linear-gradient(180deg, #5b3a25 0%, #3d2518 34%, #29170f 68%, #1a0e09 100%)",
        borderWidth: Math.max(1, u(1)),
        borderColor: "rgba(0,0,0,0.65)",
        alignItems: "center",
        justifyContent: "center",
        // Contact shadow, then the table's long soft shadow on the floor, then the rail's own roundness.
        boxShadow: [
          `0 ${u(3)}px ${u(4)}px rgba(0,0,0,0.6)`,
          `0 ${u(18)}px ${u(36)}px rgba(0,0,0,0.62)`,
          `inset 0 ${u(2)}px ${u(2)}px rgba(255,222,180,0.22)`,
          `inset 0 -${u(3)}px ${u(5)}px rgba(0,0,0,0.55)`,
        ].join(", "),
        elevation: 12,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: radius,
          // The lamp's reflection along the top of the rail.
          backgroundImage: "radial-gradient(ellipse farthest-side at 50% 0%, rgba(255,226,186,0.2) 0%, rgba(255,226,186,0.06) 45%, rgba(255,226,186,0) 75%)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: u(RAIL - 4),
          top: u(RAIL - 4),
          width: u(FELT.w + 8),
          height: u(FELT.h + 8),
          borderRadius: u(FELT.w / 2 + 4),
          // A thin brass bead where the rail meets the felt.
          borderWidth: Math.max(1, u(1)),
          borderColor: "rgba(214,170,105,0.45)",
          backgroundColor: "#0e0805",
        }}
      />
      <View
        style={{
          width: u(FELT.w),
          height: u(FELT.h),
          borderRadius: feltRadius,
          // Felt under an overhead lamp: brightest just above the board, darker toward the rail.
          backgroundColor: "#0f5f35",
          backgroundImage:
            "radial-gradient(ellipse farthest-side at 50% 44%, #1d8a4e 0%, #16753f 38%, #0e5a31 74%, #083c21 100%)",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            opacity: lamp.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
            backgroundImage:
              "radial-gradient(ellipse closest-side at 50% 42%, rgba(255,236,190,0.13) 0%, rgba(255,236,190,0.05) 55%, rgba(255,236,190,0) 100%)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "10%",
            top: "11%",
            width: "80%",
            height: "78%",
            borderRadius: u(FELT.h),
            // The betting line, printed into the felt.
            borderWidth: Math.max(1, u(1)),
            borderColor: "rgba(214,240,220,0.1)",
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
                <View style={{ width: u(16), height: u(16) }}>
                  {[0, 1, 2].map((chip) => (
                    <View
                      key={chip}
                      style={{ ...chipLook(16, scale), position: "absolute", left: 0, top: u(2) - chip * u(2.4) }}
                    />
                  ))}
                </View>
                <Text style={{ color: "#ecfccb", fontWeight: "800", fontSize: u(14), textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: u(1) }, textShadowRadius: u(2) }}>
                  {pot}
                </Text>
              </>
            ) : null}
          </View>
          {onDeal && round == null ? (
            <Pressable
              style={{
                marginTop: u(4),
                backgroundColor: "#e8c98a",
                backgroundImage: "linear-gradient(180deg, #f4dfae 0%, #e3c07c 100%)",
                borderRadius: u(14),
                paddingHorizontal: u(18),
                paddingVertical: u(6),
                boxShadow: `0 ${u(2)}px ${u(5)}px rgba(0,0,0,0.45), inset 0 ${u(1)}px 0 rgba(255,255,255,0.55)`,
              }}
              onPress={onDeal}
            >
              <Text style={{ color: "#1c1917", fontWeight: "800", fontSize: u(13) }}>{t("deal")}</Text>
            </Pressable>
          ) : null}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: feltRadius,
            // The rail's shadow falling on the felt, deeper on the far side from the lamp.
            boxShadow: `inset 0 ${u(7)}px ${u(14)}px rgba(0,0,0,0.5), inset 0 0 ${u(5)}px rgba(0,0,0,0.55)`,
          }}
        />
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
  seats: (SeatSlot | undefined)[];
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

/**
 * The round camera and mic buttons. Both share one look: a dark glass face when off,
 * with the same slash across the icon, and a lit face with a soft glow when on.
 */
function MediaButton({
  icon,
  on,
  held = false,
  style,
  ...press
}: {
  icon: "videocam" | "mic";
  on: boolean;
  held?: boolean;
  style: object;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  delayLongPress?: number;
}) {
  return (
    <Pressable
      {...press}
      style={({ pressed }) => [styles.media, on ? styles.mediaOn : null, style, held ? styles.mediaHeld : null, pressed ? styles.mediaPressed : null]}
    >
      <View style={styles.mediaIcon}>
        <Ionicons name={icon} size={22} color={on ? "#171b35" : "#d4d8ff"} />
        {on ? null : <View style={styles.mediaSlash} />}
      </View>
    </Pressable>
  );
}

export function CameraButton({ on, held, onToggle }: { on: boolean; held?: boolean; onToggle: (on: boolean) => void }) {
  return (
    <MediaButton
      icon="videocam"
      on={on}
      held={held}
      style={styles.cameraSpot}
      onPress={() => {
        if (!held) onToggle(!on);
      }}
    />
  );
}

export function TalkButton({ on, onTalk }: { on: boolean; onTalk: (on: boolean) => void }) {
  const held = useRef(false);
  return (
    <MediaButton
      icon="mic"
      on={on}
      style={styles.talkSpot}
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
    />
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
  media: {
    position: "absolute",
    bottom: 16,
    zIndex: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    // Dark glass, lit from above like the table.
    backgroundColor: "#171a30",
    backgroundImage: "linear-gradient(180deg, #2a2f52 0%, #1a1d36 55%, #11132a 100%)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 1px rgba(0,0,0,0.5), 0 6px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.35)",
  },
  mediaOn: {
    backgroundColor: "#a8b2ff",
    backgroundImage: "linear-gradient(180deg, #d0d6ff 0%, #a8b2ff 55%, #8e99f2 100%)",
    borderColor: "#dde1ff",
    boxShadow: "0 1px 1px rgba(0,0,0,0.4), 0 0 16px rgba(168,178,255,0.5), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(60,70,170,0.35)",
  },
  mediaPressed: { transform: [{ scale: 0.94 }] },
  mediaHeld: { opacity: 0.35 },
  cameraSpot: { right: 76 },
  talkSpot: { right: 16 },
  mediaIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  /** The same "off" slash on both buttons: a soft red line, edged in the button's face so it cuts the icon. */
  mediaSlash: {
    position: "absolute",
    width: 5,
    height: 31,
    borderRadius: 2.5,
    backgroundColor: "#f19c9c",
    borderWidth: 1.5,
    borderColor: "#1c2039",
    transform: [{ rotate: "-45deg" }],
  },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#090b16",
    // A dim room: the app's indigo, lifted where the table stands and falling off to the corners.
    backgroundImage: "radial-gradient(ellipse farthest-side at 50% 47%, #1a1c33 0%, #10122a 42%, #090b16 78%, #05060c 100%)",
    pointerEvents: "none",
  },
  roomGlow: {
    position: "absolute",
    width: "150%",
    height: "86%",
    left: "-25%",
    top: "4%",
    // Warm spill from the lamp over the table onto the floor around it.
    backgroundImage: "radial-gradient(ellipse closest-side, rgba(255,214,160,0.09) 0%, rgba(255,214,160,0.035) 50%, rgba(255,214,160,0) 100%)",
    pointerEvents: "none",
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
