/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from "react-native";

/**
 * Sound files in assets/sounds (sources and licenses in CREDITS.txt).
 * A sound with several files plays one of them at random.
 */
const SOURCES = {
  applause: [require("../../assets/sounds/applause.m4a")],
  chip: [
    require("../../assets/sounds/chip-1.wav"),
    require("../../assets/sounds/chip-2.wav"),
    require("../../assets/sounds/chip-3.wav"),
    require("../../assets/sounds/chip-4.wav"),
    require("../../assets/sounds/chip-5.wav"),
  ],
  chipsCollect: [require("../../assets/sounds/chips-collect.wav")],
  chipsPush: [require("../../assets/sounds/chips-push.wav")],
  cardDeal: [require("../../assets/sounds/card-deal.wav")],
  cardFlip: [require("../../assets/sounds/card-flip.wav")],
} as const;

export type Sfx = keyof typeof SOURCES;

const VOLUME: Record<Sfx, number> = {
  applause: 0.8,
  chip: 0.9,
  chipsCollect: 0.7,
  chipsPush: 0.85,
  cardDeal: 0.5,
  cardFlip: 0.65,
};

/** Players per file, so sounds that come fast (dealing, several bets) can overlap. */
const VOICES: Record<Sfx, number> = {
  applause: 1,
  chip: 2,
  chipsCollect: 1,
  chipsPush: 1,
  cardDeal: 3,
  cardFlip: 2,
};

type Status = { didJustFinish?: boolean };
type Player = {
  volume: number;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  addListener: (event: "playbackStatusUpdate", listener: (status: Status) => void) => unknown;
};
type PlayerOptions = { keepAudioSessionActive?: boolean; downloadFirst?: boolean; updateInterval?: number };
type AudioModule = { createAudioPlayer?: (source: number, options?: PlayerOptions) => Player };

/** A player that is rewound and waiting is `ready`; playing it is then immediate. */
type Voice = { player: Player; ready: boolean };

let audio: AudioModule | null | undefined;
const voices = new Map<Sfx, Voice[]>();
const turn = new Map<Sfx, number>();

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

function voicesFor(name: Sfx): Voice[] {
  const made = voices.get(name);
  if (made) return made;
  const module = load();
  if (!module?.createAudioPlayer) return [];
  const list: Voice[] = [];
  for (const file of SOURCES[name]) {
    for (let copy = 0; copy < VOICES[name]; copy += 1) {
      // Keeping the audio session on avoids switching it back on (slow on iOS) before every
      // sound, and does not cut into the table's voice chat when a sound ends.
      const player = module.createAudioPlayer(file, { keepAudioSessionActive: true, downloadFirst: true, updateInterval: 250 });
      player.volume = VOLUME[name];
      const voice: Voice = { player, ready: true };
      player.addListener("playbackStatusUpdate", (status) => {
        if (!status.didJustFinish || voice.ready) return;
        // Rewind as soon as it ends, so the next play does not wait for a seek. Pause first:
        // on Android the player is still set to play after it ends, so a seek alone starts it
        // again, and it would loop forever.
        player.pause();
        void player.seekTo(0).then(
          () => {
            voice.ready = true;
          },
          () => {
            voice.ready = true;
          },
        );
      });
      list.push(voice);
    }
  }
  // Shuffle once so a sound with several files does not always start with the first.
  list.sort(() => Math.random() - 0.5);
  voices.set(name, list);
  return list;
}

/** Loads every sound so the first one at the table plays at once. Safe to call again. */
export function preloadSfx() {
  try {
    for (const name of Object.keys(SOURCES) as Sfx[]) voicesFor(name);
  } catch {
    // Sound is a nice-to-have.
  }
}

let ownChipAt = 0;

/** Your own call, bet or raise: the chip sound plays on the tap, not when the server answers. */
export function playOwnChip() {
  ownChipAt = Date.now();
  playSfx("chip");
}

/** True right after playOwnChip, so the bet showing up on your seat does not play it twice. */
export function ownChipJustPlayed() {
  return Date.now() - ownChipAt < 2500;
}

/** Plays a short sound from the start. */
export function playSfx(name: Sfx) {
  try {
    const list = voicesFor(name);
    if (list.length === 0) return;
    const start = turn.get(name) ?? 0;
    for (let step = 0; step < list.length; step += 1) {
      const index = (start + step) % list.length;
      const voice = list[index]!;
      if (!voice.ready) continue;
      turn.set(name, index + 1);
      voice.ready = false;
      voice.player.play();
      return;
    }
    // Every copy is still playing: restart the oldest one.
    const voice = list[start % list.length]!;
    turn.set(name, start + 1);
    voice.ready = false;
    voice.player.pause();
    void voice.player.seekTo(0).then(() => voice.player.play(), () => voice.player.play());
  } catch {
    // Sound is a nice-to-have; never let it break the table.
  }
}
