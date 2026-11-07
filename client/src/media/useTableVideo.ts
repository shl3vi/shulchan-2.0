import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { VideoTrack } from "livekit-client";
import type { Credentials } from "@/game/types";
import { allowCapture } from "@/media/capturePermission";
import { videoSupported } from "@/media/videoSupport";

type VideoHandle = {
  disconnect: () => void;
  setMic: (enabled: boolean) => Promise<void>;
  setCamera: (enabled: boolean) => Promise<void>;
  mute: (identity: string, muted: boolean) => void;
  hide: (identity: string, hidden: boolean) => void;
};

export function useTableVideo(credentials: Credentials | null) {
  const [tracks, setTracks] = useState<Map<string, VideoTrack>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [live, setLive] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [videoNotice, setVideoNotice] = useState(false);
  const handle = useRef<VideoHandle | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);
  const desired = useRef({ camera: false, mic: false });
  const held = useRef<Set<string>>(new Set());
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  const gameId = credentials?.gameId;
  const playerId = credentials?.playerId;
  const playerSecret = credentials?.playerSecret;

  useEffect(() => {
    const ticket = generation.current;
    return () => {
      if (generation.current === ticket) generation.current += 1;
      starting.current = false;
      handle.current?.disconnect();
      handle.current = null;
      reset();
    };
  }, [gameId, playerId, playerSecret]);

  function reset() {
    desired.current = { camera: false, mic: false };
    held.current = new Set();
    setTracks(new Map());
    setMicOn(false);
    setCameraOn(false);
    setLive(false);
    setMuted(new Set());
    setHidden(new Set());
  }

  function ensure() {
    const current = credentialsRef.current;
    if (Platform.OS === "web" || !videoSupported || !current || handle.current || starting.current) return;
    const ticket = generation.current;
    starting.current = true;
    void import("@/media/tableVideoSession").then((mod) => {
      starting.current = false;
      if (ticket !== generation.current || handle.current) return;
      const session = mod.startTableVideo(current, setTracks, setMicOn, () => {
        handle.current = null;
        reset();
      }, desired.current);
      handle.current = session;
      setLive(true);
    }).catch(() => {
      starting.current = false;
      reset();
    });
  }

  useEffect(() => {
    for (const id of held.current) {
      handle.current?.mute(id, true);
      handle.current?.hide(id, true);
    }
  }, [tracks]);

  const visible = new Map(Array.from(tracks).filter(([identity]) => !hidden.has(identity)));

  return {
    videoNotice,
    dismissVideoNotice() {
      setVideoNotice(false);
    },
    tracks: visible,
    micOn,
    cameraOn,
    live,
    muted,
    hidden,
    setMic(enabled: boolean) {
      if (!videoSupported) return;
      void (async () => {
        if (enabled && !(await allowCapture("microphone"))) enabled = false;
        desired.current.mic = enabled;
        setMicOn(enabled);
        if (!enabled) {
          void handle.current?.setMic(false);
          return;
        }
        if (!handle.current) {
          ensure();
          return;
        }
        void handle.current.setMic(true).then(() => {
          if (!desired.current.mic) setMicOn(false);
        });
      })();
    },
    setCamera(enabled: boolean) {
      if (!videoSupported) {
        if (enabled) setVideoNotice(true);
        return;
      }
      void (async () => {
        if (enabled && !(await allowCapture("camera"))) enabled = false;
        desired.current.camera = enabled;
        setCameraOn(enabled);
        if (!enabled) {
          void handle.current?.setCamera(false);
          return;
        }
        if (!handle.current) {
          ensure();
          return;
        }
        void handle.current.setCamera(true).catch(() => {
          desired.current.camera = false;
          setCameraOn(false);
        });
      })();
    },
    holdOff(ids: string[]) {
      const next = new Set(ids);
      const released = [...held.current].filter((id) => !next.has(id));
      held.current = next;
      for (const id of released) {
        handle.current?.mute(id, false);
        handle.current?.hide(id, false);
      }
      for (const id of next) {
        handle.current?.mute(id, true);
        handle.current?.hide(id, true);
      }
      setMuted((current) => {
        const copy = new Set(current);
        for (const id of released) copy.delete(id);
        for (const id of next) copy.add(id);
        return copy;
      });
      setHidden((current) => {
        const copy = new Set(current);
        for (const id of released) copy.delete(id);
        for (const id of next) copy.add(id);
        return copy;
      });
    },
    toggleMute(identity: string) {
      if (held.current.has(identity)) return;
      const next = !muted.has(identity);
      handle.current?.mute(identity, next);
      setMuted((current) => {
        const copy = new Set(current);
        if (next) copy.add(identity);
        else copy.delete(identity);
        return copy;
      });
    },
    toggleHide(identity: string) {
      if (held.current.has(identity)) return;
      const next = !hidden.has(identity);
      handle.current?.hide(identity, next);
      setHidden((current) => {
        const copy = new Set(current);
        if (next) copy.add(identity);
        else copy.delete(identity);
        return copy;
      });
    },
  };
}
