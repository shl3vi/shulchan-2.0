/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform, TurboModuleRegistry } from "react-native";

/**
 * Sound files in assets/sounds (sources and licenses in CREDITS.txt).
 * A sound with several files plays one of them at random.
 */
const SOURCES = {
  applause: [require("../../assets/sounds/applause.wav")],
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

const NAMES = Object.keys(SOURCES) as Sfx[];

const VOLUME: Record<Sfx, number> = {
  applause: 0.8,
  chip: 0.9,
  chipsCollect: 0.7,
  chipsPush: 0.85,
  cardDeal: 0.5,
  cardFlip: 0.65,
};

/**
 * Two ways to play. The fast one is react-native-audio-api: every sound is decoded into memory
 * once and starts in a few milliseconds, and many can play at once. It is only in builds made
 * after it was added. Expo Go, older builds and the web use expo-audio players instead, which
 * take longer to start.
 */
type Engine = {
  preload: () => void;
  play: (name: Sfx) => void;
  /** Stops the output while no table is open, so it does not use the battery. */
  sleep: () => void;
};

let engine: Engine | null | undefined;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

// ---- react-native-audio-api ----

type FastBuffer = object;
type FastGain = { gain: { value: number }; connect: (node: unknown) => void };
type FastSource = { buffer: FastBuffer | null; connect: (node: unknown) => void; start: (when?: number) => void };
type FastContext = {
  state: "running" | "closed" | "suspended";
  destination: unknown;
  resume: () => Promise<unknown>;
  suspend: () => Promise<unknown>;
  createGain: () => FastGain;
  createBufferSource: () => FastSource;
  decodeAudioData: (input: number) => Promise<FastBuffer>;
};
type FastModule = {
  AudioContext: new (options?: { latencyHint?: "interactive" }) => FastContext;
  AudioManager: { disableSessionManagement: () => void };
};

function fastEngine(): Engine | null {
  if (Platform.OS === "web") return null;
  // Importing the package throws when its native part is missing, so look for it first.
  if (!TurboModuleRegistry.get("AudioAPIModule")) return null;
  let module: FastModule;
  try {
    module = require("react-native-audio-api") as FastModule;
    // LiveKit owns the iOS audio session (voice chat needs the microphone); sounds play through
    // whatever it set up. On Android this also keeps us from taking audio focus from the call.
    module.AudioManager.disableSessionManagement();
  } catch {
    return null;
  }
  let context: FastContext | null = null;
  const gains = new Map<Sfx, FastGain>();
  const buffers = new Map<Sfx, FastBuffer[]>();
  const loading = new Map<Sfx, Promise<void>>();

  function ready(): FastContext {
    if (!context) context = new module.AudioContext({ latencyHint: "interactive" });
    if (context.state === "suspended") void context.resume();
    return context;
  }

  function load(name: Sfx) {
    const existing = loading.get(name);
    if (existing) return existing;
    const ctx = ready();
    const promise = Promise.all(SOURCES[name].map((file) => ctx.decodeAudioData(file))).then(
      (decoded) => {
        buffers.set(name, decoded);
      },
      () => {
        // A file that cannot be decoded stays silent; try again next time.
        loading.delete(name);
      },
    );
    loading.set(name, promise);
    return promise;
  }

  function start(name: Sfx) {
    const ctx = ready();
    const list = buffers.get(name);
    if (!list || list.length === 0) return false;
    let gain = gains.get(name);
    if (!gain) {
      gain = ctx.createGain();
      gain.gain.value = VOLUME[name];
      gain.connect(ctx.destination);
      gains.set(name, gain);
    }
    const source = ctx.createBufferSource();
    source.buffer = pick(list);
    source.connect(gain);
    source.start();
    return true;
  }

  return {
    preload() {
      ready();
      for (const name of NAMES) void load(name);
    },
    play(name) {
      if (start(name)) return;
      // Not decoded yet (the first sound right after opening the table): play it when it is.
      void load(name).then(() => start(name));
    },
    sleep() {
      if (context?.state === "running") void context.suspend();
    },
  };
}

// ---- expo-audio (fallback) ----

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
type PlayerModule = { createAudioPlayer?: (source: number, options?: PlayerOptions) => Player };

/** A player that is rewound and waiting is `ready`; playing it is then immediate. */
type Voice = { player: Player; ready: boolean };

function playerEngine(): Engine | null {
  let module: PlayerModule;
  try {
    if (Platform.OS !== "web") {
      const { requireOptionalNativeModule } = require("expo-modules-core") as {
        requireOptionalNativeModule: (name: string) => object | null;
      };
      // An older build without the audio module stays silent instead of crashing.
      if (!requireOptionalNativeModule("ExpoAudio")) return null;
    }
    module = require("expo-audio") as PlayerModule;
  } catch {
    return null;
  }
  if (!module.createAudioPlayer) return null;
  const create: NonNullable<PlayerModule["createAudioPlayer"]> = module.createAudioPlayer;
  const voices = new Map<Sfx, Voice[]>();
  const turn = new Map<Sfx, number>();

  function voicesFor(name: Sfx): Voice[] {
    const made = voices.get(name);
    if (made) return made;
    const list: Voice[] = [];
    for (const file of SOURCES[name]) {
      for (let copy = 0; copy < VOICES[name]; copy += 1) {
        // Keeping the audio session on avoids switching it back on (slow on iOS) before every
        // sound, and does not cut into the table's voice chat when a sound ends.
        const player = create(file, { keepAudioSessionActive: true, downloadFirst: true, updateInterval: 250 });
        player.volume = VOLUME[name];
        const voice: Voice = { player, ready: true };
        player.addListener("playbackStatusUpdate", (status) => {
          if (!status.didJustFinish || voice.ready) return;
          // Rewind as soon as it ends, so the next play does not wait for a seek. Pause first:
          // on Android the player is still set to play after it ends, so a seek alone starts it
          // again, and it would loop forever.
          player.pause();
          const done = () => {
            voice.ready = true;
          };
          void player.seekTo(0).then(done, done);
        });
        list.push(voice);
      }
    }
    // Shuffle once so a sound with several files does not always start with the first.
    list.sort(() => Math.random() - 0.5);
    voices.set(name, list);
    return list;
  }

  return {
    preload() {
      for (const name of NAMES) voicesFor(name);
    },
    play(name) {
      const list = voicesFor(name);
      if (list.length === 0) return;
      const first = turn.get(name) ?? 0;
      for (let step = 0; step < list.length; step += 1) {
        const index = (first + step) % list.length;
        const voice = list[index]!;
        if (!voice.ready) continue;
        turn.set(name, index + 1);
        voice.ready = false;
        voice.player.play();
        return;
      }
      // Every copy is still playing: restart the oldest one.
      const voice = list[first % list.length]!;
      turn.set(name, first + 1);
      voice.ready = false;
      voice.player.pause();
      void voice.player.seekTo(0).then(() => voice.player.play(), () => voice.player.play());
    },
    sleep() {},
  };
}

function current(): Engine | null {
  if (engine !== undefined) return engine;
  engine = null;
  try {
    engine = fastEngine() ?? playerEngine();
  } catch {
    engine = null;
  }
  return engine;
}

/** Loads every sound so the first one at the table plays at once. Safe to call again. */
export function preloadSfx() {
  try {
    current()?.preload();
  } catch {
    // Sound is a nice-to-have.
  }
}

/** Lets the sound output rest after leaving the table. The next sound wakes it. */
export function sleepSfx() {
  try {
    current()?.sleep();
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
    current()?.play(name);
  } catch {
    // Sound is a nice-to-have; never let it break the table.
  }
}
