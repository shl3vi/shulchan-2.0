import { Image, StyleSheet } from "react-native";

/**
 * Light-and-shadow overlays drawn by scripts/make-textures.mjs; the colors under them stay in the styles.
 * The files on disk are @2x: Metro picks the scale from the name, so they are required without it.
 */
export const FELT = require("../../assets/images/textures/felt.png");
export const WOOD = require("../../assets/images/textures/wood.png");

/** A tiled texture laid over its parent's background, under everything else in it. */
export function Texture({ source, radius, opacity = 1 }: { source: number; radius: number; opacity?: number }) {
  return (
    <Image
      source={source}
      resizeMode="repeat"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width: "100%", height: "100%", borderRadius: radius, opacity }]}
    />
  );
}
