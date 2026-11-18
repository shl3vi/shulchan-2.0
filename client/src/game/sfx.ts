/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from "react-native";

/**
 * Sound files in assets/sounds. Chips and cards are Kenney's Casino Audio (CC0, see CREDITS.txt);
 * win comes from scripts/make-sounds.mjs. A sound with several files plays one of them at random.
 */
const SOURCES = {
  win: [require("../../assets/sounds/win.wav")],
  chip: [
    require("../../assets/sounds/chip-1.wav"),
    require("../../assets/sounds/chip-2.wav"),
    require("../../assets/sounds/chip-3.wav"),
  ],
  chipsCollect: [require("../../assets/sounds/chips-collect.wav")],
  chipsPush: [require("../../assets/sounds/chips-push.wav")],
  cardDeal: [require("../../assets/sounds/card-deal.wav")],
  cardFlip: [require("../../assets/sounds/card-flip.wav")],
} as const;

export type Sfx = keyof typeof SOURCES;

const VOLUME: Record<Sfx, number> = {
  win: 0.75,
  chip: 0.8,
  chipsCollect: 0.55,
  chipsPush: 0.85,
  cardDeal: 0.5,
  cardFlip: 0.65,
};

/** Players per file, so sounds that come fast (dealing, several bets) can overlap. */
const VOICES: Record<Sfx, number> = {
  win: 1,
  chip: 2,
  chipsCollect: 1,
  chipsPush: 1,
  cardDeal: 3,
  cardFlip: 2,
};

type Player = { volume: number; play: () => void; seekTo: (seconds: number) => Promise<void> };
type AudioModule = { createAudioPlayer?: (source: number) => Player };

let audio: AudioModule | null | undefined;
const players = new Map<string, Player>();
const nextVoice = new Map<Sfx, number>();

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

/** Plays a short sound from the start. Players are made on first use and kept. */
export function playSfx(name: Sfx) {
  const module = load();
  if (!module?.createAudioPlayer) return;
  try {
    const files = SOURCES[name];
    const file = Math.floor(Math.random() * files.length);
    const voice = nextVoice.get(name) ?? 0;
    nextVoice.set(name, (voice + 1) % VOICES[name]);
    const key = `${name}:${file}:${voice}`;
    let player = players.get(key);
    if (!player) {
      player = module.createAudioPlayer(files[file]);
      player.volume = VOLUME[name];
      players.set(key, player);
      player.play();
      return;
    }
    const ready = player;
    void ready.seekTo(0).then(() => ready.play(), () => ready.play());
  } catch {
    // Sound is a nice-to-have; never let it break the table.
  }
}
