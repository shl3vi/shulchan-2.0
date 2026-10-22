import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { stepDice } from "@/game/diceSound";
import {
  checkers,
  legalMoves,
  pipCount,
  type Color,
  type Game,
  type Move,
} from "@/game/backgammon";
import { t, type MessageKey } from "@/i18n";

const STATUS: Record<string, MessageKey> = {
  roll: "bgMsgRoll",
  game: "bgMsgGame",
  gammon: "bgMsgGammon",
  backgammon: "bgMsgBackgammon",
  no_move: "bgMsgNoMove",
  tied: "bgMsgTied",
  offered: "bgMsgOffered",
  declined: "bgMsgDeclined",
};

function statusText(code: string) {
  const key = STATUS[code];
  return key ? t(key) : code;
}

const TOP = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const BOTTOM = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const OPTION_COLORS = ["#22d3ee", "#fb923c"];

function pointColor(point: number) {
  return point % 2 === 1 ? "#7f1d1d" : "#1a6b78";
}

function Triangle({ point, up, side, length, tint }: { point: number; up: boolean; side: number; length: number; tint?: string }) {
  const color = tint ?? pointColor(point);
  return (
    <View
      style={
        up
          ? {
              width: 0,
              height: 0,
              borderLeftWidth: side,
              borderRightWidth: side,
              borderBottomWidth: length,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderBottomColor: color,
            }
          : {
              width: 0,
              height: 0,
              borderLeftWidth: side,
              borderRightWidth: side,
              borderTopWidth: length,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderTopColor: color,
            }
      }
    />
  );
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

function PipDie({ value, size = 22 }: { value: number; size?: number }) {
  const face = ((value - 1) % 6) + 1;
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.18 }]}>
      {PIPS[face]?.map(([col, row], index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: size,
            backgroundColor: "#1c1917",
            left: size * (0.16 + col * 0.25),
            top: size * (0.16 + row * 0.25),
          }}
        />
      ))}
    </View>
  );
}

function Checker({ color, size, overlap }: { color: Color; size: number; overlap: boolean }) {
  const light = color === "white";
  return (
    <View
      style={[
        styles.checker,
        light ? styles.white : styles.black,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginTop: overlap ? -size * 0.34 : 2,
        },
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: size * 0.68,
          height: size * 0.68,
          borderRadius: size,
          borderWidth: 1,
          borderColor: light ? "#b9aa94" : "#57534e",
          backgroundColor: light ? "#efe4d2" : "#292524",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: size * 0.14,
          left: size * 0.2,
          width: size * 0.32,
          height: size * 0.16,
          borderRadius: size,
          backgroundColor: light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)",
        }}
      />
    </View>
  );
}

export function DiceCup({
  faces,
  rolling,
  onDone,
}: {
  faces: number[];
  rolling: boolean;
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [tumbling, setTumbling] = useState(false);
  const [pose, setPose] = useState([
    { x: -9, y: -2, rot: -8, face: 1 },
    { x: 9, y: 6, rot: 12, face: 1 },
  ]);

  useEffect(() => {
    if (!rolling) return;
    const dice = [
      { x: -4, y: -30, vx: 40, vy: 150, rot: 20, vrot: 900 },
      { x: 6, y: -38, vx: -30, vy: 170, rot: -30, vrot: -1100 },
    ];
    setTumbling(true);
    let last = Date.now();
    const started = last;
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const age = now - started;
      stepDice(dice, 14, dt);
      if (age > 1100) {
        dice.forEach((die) => {
          die.vx *= 0.8;
          die.vy *= 0.8;
          die.vrot *= 0.8;
        });
      }
      setPose(
        dice.map((die, index) => ({
          x: die.x,
          y: die.y,
          rot: die.rot,
          face: age > 1100 ? faces[index] ?? 1 : 1 + (Math.floor(Math.abs(die.rot) / 50) % 6),
        })),
      );
      if (age > 1450) {
        clearInterval(timer);
        setTumbling(false);
        setPose([
          { x: -9, y: -2, rot: 0, face: faces[0] ?? 1 },
          { x: 9, y: 6, rot: 0, face: faces[1] ?? 1 },
        ]);
        onDoneRef.current();
      }
    }, 16);
    return () => clearInterval(timer);
  }, [rolling, faces]);

  const shown = (tumbling || rolling ? pose : [
    { x: -9, y: -2, rot: 0, face: faces[0] ?? 1 },
    { x: 9, y: 6, rot: 0, face: faces[1] ?? 1 },
  ]).slice(0, faces.length);

  return (
    <View style={styles.cupWrap}>
      <View style={styles.cupRim}>
        <View style={styles.cupWell}>
          {faces.length === 0 ? null : shown.map((die, index) => (
            <View
              key={index}
              style={[
                styles.cupDie,
                {
                  transform: [
                    { translateX: die.x },
                    { translateY: die.y },
                    { rotate: `${die.rot}deg` },
                    { scaleX: 0.82 + 0.18 * Math.abs(Math.cos((die.rot * Math.PI) / 180)) },
                  ],
                },
              ]}
            >
              <PipDie value={die.face} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function BackgammonBoard({
  game,
  selected,
  enabled,
  onSelect,
  onMove,
  onAgain,
}: {
  game: Game;
  selected: number | "bar" | null;
  enabled: boolean;
  onSelect: (from: number | "bar" | null) => void;
  onMove: (move: Move) => void;
  onAgain?: () => void;
}) {
  const [boardW, setBoardW] = useState(360);
  const pointW = Math.max(16, (boardW - 40) / 12);
  const side = pointW / 2 - 1;
  const length = Math.min(150, Math.max(88, side * 6));
  const checker = Math.max(12, Math.min(side * 1.45, 24));
  const moves = enabled ? legalMoves(game) : [];
  const targets = selected == null ? [] : moves.filter((move) => move.from === selected);
  const optionDice = [...new Set(targets.map((move) => move.die))];

  function optionColor(die: number) {
    return OPTION_COLORS[Math.max(0, optionDice.indexOf(die))] ?? OPTION_COLORS[0];
  }

  function pressPoint(point: number) {
    if (!enabled) return;
    const offFromHere = targets.find((move) => move.from === point && move.to === "off");
    if (selected === point) {
      if (offFromHere) onMove(offFromHere);
      else onSelect(null);
      return;
    }
    const landing = targets.find((move) => move.to === point);
    if (landing) {
      onMove(landing);
      return;
    }
    if (checkers(game, point, game.turn) > 0 && moves.some((move) => move.from === point)) onSelect(point);
  }

  function stack(point: number, up: boolean) {
    const white = checkers(game, point, "white");
    const black = checkers(game, point, "black");
    const color: Color | null = white > 0 ? "white" : black > 0 ? "black" : null;
    const count = white + black;
    const shown = Math.min(count, 5);
    const chosen = selected === point;
    const landing = targets.find((move) => move.to === point);
    const tint = chosen ? "#f6d36b" : landing ? optionColor(landing.die) : undefined;
    return (
      <Pressable key={point} style={[styles.point, chosen && styles.chosen]} onPress={() => pressPoint(point)}>
        <View style={up ? styles.triUp : styles.triDown} pointerEvents="none">
          <Triangle point={point} up={up} side={side} length={length} tint={tint} />
        </View>
        <View style={[styles.stack, up ? styles.stackUp : styles.stackDown, up ? styles.stackGrowUp : null]} pointerEvents="none">
          {Array.from({ length: shown }, (_, index) => (
            <Checker key={index} color={color ?? "white"} size={checker} overlap={index > 0} />
          ))}
          {count > 5 ? <Text style={styles.count}>{count}</Text> : null}
          {landing ? <Text style={[styles.optionBadge, { color: optionColor(landing.die) }]}>{landing.die}</Text> : null}
        </View>
      </Pressable>
    );
  }

  const barHot = enabled && (selected === "bar" || (game.bar[game.turn] > 0 && moves.some((move) => move.from === "bar")));

  return (
    <View style={styles.board} onLayout={(event) => setBoardW(event.nativeEvent.layout.width)}>
      <View style={[styles.half, { minHeight: length + 8 }]}>
        {TOP.slice(0, 6).map((point) => stack(point, false))}
        <Pressable
          style={[styles.bar, barHot && styles.chosen]}
          onPress={() => {
            if (selected === "bar") {
              onSelect(null);
              return;
            }
            if (game.bar[game.turn] > 0 && moves.some((move) => move.from === "bar")) onSelect("bar");
          }}
        >
          <Text style={styles.barCount}>{game.bar.black || ""}</Text>
          <Text style={styles.barCount}>{game.bar.white || ""}</Text>
        </Pressable>
        {TOP.slice(6).map((point) => stack(point, false))}
      </View>
      <View style={styles.cubeRail}>
        <Text style={styles.cubeLabel}>{t("cube")}</Text>
        <Text style={styles.cubeValue}>{game.cube}</Text>
        <Text style={styles.pips}>
          {pipCount(game, "black")} · {pipCount(game, "white")}
        </Text>
      </View>
      <View style={[styles.half, { minHeight: length + 8 }]}>
        {BOTTOM.slice(0, 6).map((point) => stack(point, true))}
        <View style={styles.bar} />
        {BOTTOM.slice(6).map((point) => stack(point, true))}
      </View>
      {game.message && !game.winner ? <Text style={styles.win}>{statusText(game.message)}</Text> : null}
      {onAgain ? (
        <Pressable style={styles.again} onPress={onAgain}>
          <Text style={styles.againText}>{t("bgAgain")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 520,
    marginHorizontal: 8,
    backgroundColor: "#5c3317",
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#f6d36b",
    padding: 6,
    gap: 4,
  },
  half: { flexDirection: "row", alignItems: "stretch" },
  point: { flex: 1, alignItems: "center", justifyContent: "center" },
  triDown: { position: "absolute", top: 0 },
  triUp: { position: "absolute", bottom: 0 },
  stack: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  stackUp: { bottom: 0 },
  stackDown: { top: 0 },
  stackGrowUp: { flexDirection: "column-reverse" },
  stackGrowUp: { flexDirection: "column-reverse" },
  checker: { borderWidth: 1 },
  white: { backgroundColor: "#f5f0e6", borderColor: "#d6d3d1" },
  black: { backgroundColor: "#1c1917", borderColor: "#f6d36b" },
  count: { color: "#f6d36b", fontSize: 10, fontWeight: "900" },
  bar: {
    width: 28,
    marginHorizontal: 2,
    borderRadius: 6,
    backgroundColor: "#3f2412",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  cupWrap: { width: 78, height: 78, alignItems: "center", justifyContent: "center" },
  cupRim: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#6b3a1f",
    borderWidth: 4,
    borderColor: "#d7a15a",
    alignItems: "center",
    justifyContent: "center",
  },
  cupWell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#140d09",
    alignItems: "center",
    justifyContent: "center",
  },
  cupDie: { position: "absolute" },
  die: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#fafaf9",
    alignItems: "center",
    justifyContent: "center",
  },
  dieDim: { opacity: 0.45 },
  dieText: { color: "#1c1917", fontWeight: "900", fontSize: 13 },
  barCount: { color: "#f6d36b", fontSize: 11, fontWeight: "800" },
  tray: {
    width: 22,
    marginLeft: 4,
    borderRadius: 4,
    backgroundColor: "#3f2412",
    alignItems: "center",
    justifyContent: "center",
  },
  trayCount: { color: "#fafaf9", fontSize: 11, fontWeight: "800" },
  cubeRail: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  cubeLabel: { color: "#f6d36b", fontSize: 11, fontWeight: "700" },
  cubeValue: {
    minWidth: 28,
    textAlign: "center",
    color: "#1c1917",
    backgroundColor: "#f6d36b",
    borderRadius: 4,
    overflow: "hidden",
    fontWeight: "900",
    paddingHorizontal: 6,
  },
  pips: { color: "#f6d36b", fontSize: 11, fontWeight: "700" },
  chosen: { backgroundColor: "rgba(246,211,107,0.55)", borderRadius: 8 },
  optionBadge: {
    marginTop: 2,
    minWidth: 16,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#1c1917",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 3,
  },
  win: { color: "#f6d36b", textAlign: "center", fontWeight: "800" },
  again: {
    position: "absolute",
    alignSelf: "center",
    bottom: 16,
    backgroundColor: "#f6d36b",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  againText: { color: "#1c1917", fontWeight: "900" },
  hidden: { height: 0, opacity: 0 },
});
