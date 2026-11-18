/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from "react-native";

/** Sound files in assets/sounds. win and lose come from scripts/make-sounds.mjs. */
const SOURCES = {
  win: require("../../assets/sounds/win.wav"),
  lose: require("../../assets/sounds/lose.wav"),
} as const;

export type Sfx = keyof typeof SOURCES;

const VOLUME: Record<Sfx, number> = {
  win: 0.7,
  lose: 0.45,
};

type Player = { volume: number; play: () => void; seekTo: (seconds: number) => Promise<void> };
type AudioModule = { createAudioPlayer?: (source: number) => Player };

let audio: AudioModule | null | undefined;
const players = new Map<Sfx, Player>();

function load(): AudioModule | null {
  if (audio !== undefined) return audio;
  audio = null;
  try {
    if (Platform.OS !== "web") {
      const { requireOptionalNativeModule } = require("expo-modules-core") as {
        requireOptionalNativeModule: (name: string) => object | null;
      };
      // An older build without the audio module stays silent instead of crashing.
      if (!requireOptionalNativeModule("ExpoAudio")) return null;
    }
    audio = require("expo-audio") as AudioModule;
  } catch {
    audio = null;
  }
  return audio;
}

/** Plays a short sound from the start. One player per sound, kept for the next time. */
export function playSfx(name: Sfx) {
  const module = load();
  if (!module?.createAudioPlayer) return;
  try {
    let player = players.get(name);
    if (!player) {
      player = module.createAudioPlayer(SOURCES[name]);
      player.volume = VOLUME[name];
      players.set(name, player);
      player.play();
      return;
    }
    const ready = player;
    void ready.seekTo(0).then(() => ready.play(), () => ready.play());
  } catch {
    // Sound is a nice-to-have; never let it break the table.
  }
}
