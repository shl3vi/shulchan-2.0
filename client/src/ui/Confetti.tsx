import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const COLORS = ["#f6d36b", "#fff4d6", "#b23a48", "#86e3c4", "#a8b2ff", "#e8c070"];

/**
 * A burst of paper that tumbles and falls past the edges of the box it fills. It starts at `origin`
 * (a share of the box, the middle and a little above by default), plays once, and needs a new `key` to play again.
 */
export function Confetti({
  width,
  height,
  pieces: count = 44,
  origin = { x: 0.5, y: 0.45 },
}: {
  width: number;
  height: number;
  pieces?: number;
  origin?: { x: number; y: number };
}) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 0.55 + Math.random() * 0.6;
      return {
        color: COLORS[index % COLORS.length],
        w: 5 + Math.random() * 4,
        h: 8 + Math.random() * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
        flips: 2 + Math.floor(Math.random() * 4),
        delay: Math.random() * 450,
        duration: 1900 + Math.random() * 1100,
        progress: new Animated.Value(0),
      };
    }),
  );

  useEffect(() => {
    const burst = Animated.parallel(
      pieces.map((piece) =>
        Animated.timing(piece.progress, { toValue: 1, delay: piece.delay, duration: piece.duration, easing: Easing.linear, useNativeDriver: true })),
    );
    burst.start();
    return () => burst.stop();
  }, [pieces]);

  const reach = Math.max(width, height);
  const startX = width * origin.x;
  const startY = height * origin.y;
  const steps = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1];
  return (
    <View pointerEvents="none" style={styles.fill}>
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: piece.w,
            height: piece.h,
            borderRadius: 1.5,
            backgroundColor: piece.color,
            opacity: piece.progress.interpolate({ inputRange: [0, 0.02, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { perspective: 400 },
              // Thrown out fast, slowed by the air, then pulled down: x eases out, y follows a parabola.
              { translateX: piece.progress.interpolate({ inputRange: steps, outputRange: steps.map((t) => startX + piece.vx * reach * (1 - Math.pow(1 - t, 2)) * 0.6) }) },
              { translateY: piece.progress.interpolate({ inputRange: steps, outputRange: steps.map((t) => startY + piece.vy * reach * t * 1.2 + reach * 2.4 * t * t) }) },
              { rotate: piece.progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${piece.spin}deg`] }) },
              // Turning over and over, so each piece flashes as it catches the light.
              { rotateX: piece.progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${piece.flips * 360}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20 },
});
