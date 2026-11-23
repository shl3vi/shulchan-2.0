import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const TILE = "#1c1917";
const GOLD = "#f6d36b";

/**
 * A camera iris over a seat tile. When the camera goes off the opening shrinks to a point behind
 * a gold rim and the tile goes dark with a small "camera off" mark. When it comes back the iris
 * opens onto the picture again. Without it the last frame would stay frozen on the tile.
 */
export function SeatShutter({ closed }: { closed: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const diagonal = Math.ceil(Math.hypot(size.width, size.height));
  // How wide the opening is: the tile's diagonal is wide open, 0 is shut.
  const opening = useRef(new Animated.Value(closed ? 0 : 1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const animation = Animated.timing(opening, {
      toValue: closed ? 0 : 1,
      duration: closed ? 620 : 520,
      easing: closed ? Easing.bezier(0.55, 0, 0.85, 0.4) : Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [closed, opening]);

  const hole = opening.interpolate({ inputRange: [0, 1], outputRange: [0, diagonal] });
  const mask = Animated.add(hole, diagonal * 2);
  const rimOpacity = opening.interpolate({ inputRange: [0, 0.04, 0.9, 1], outputRange: [0, 1, 1, 0] });
  const iconOpacity = opening.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: "clamp" });
  const iconScale = opening.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0.6], extrapolate: "clamp" });
  const iconSize = Math.max(12, Math.round(Math.min(size.width, size.height) * 0.3));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {diagonal > 0 ? (
        <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Animated.View
              style={{ width: mask, height: mask, borderRadius: 9999, borderWidth: diagonal, borderColor: TILE }}
            />
          </View>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Animated.View
              style={{ width: hole, height: hole, borderRadius: 9999, borderWidth: 2, borderColor: GOLD, opacity: rimOpacity }}
            />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.center, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
          >
            <Ionicons name="videocam-off" size={iconSize} color="rgba(250,250,249,0.55)" />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
