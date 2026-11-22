import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/** Swells and settles while `active`, to say "this is the thing to press". Still when not. */
export function Breathe({ active, children, scale = 1.035, style }: { active: boolean; children: ReactNode; scale?: number; style?: StyleProp<ViewStyle> }) {
  const [phase] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(phase, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, phase]);
  return <Animated.View style={[style, { transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }] }]}>{children}</Animated.View>;
}
