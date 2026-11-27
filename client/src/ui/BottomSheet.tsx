import { useCallback, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";

type Props = {
  visible: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * A sheet that slides up from the bottom of the screen it is drawn in.
 * It is part of that screen, not a native Modal, so a page pushed from it
 * slides over it, and going back (arrow or swipe) shows it still open.
 * Render it last in the screen's root view so it sits above the content.
 */
export function BottomSheet({ visible, onClose, style, children }: Props) {
  // Android's back button closes the sheet, but only while this screen is in
  // front: on a page pushed from the sheet, back must leave that page.
  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onClose();
        return true;
      });
      return () => sub.remove();
    }, [visible, onClose]),
  );

  if (!visible) return null;
  return (
    <>
      <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn} exiting={FadeOut}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, style]}
        entering={SlideInDown}
        exiting={SlideOutDown}
        accessibilityViewIsModal
      >
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3, 4, 12, 0.68)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
