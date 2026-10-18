import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { VideoTrack } from "livekit-client";
import type { Credentials } from "@/game/types";

type VideoHandle = {
  disconnect: () => void;
  setMic: (enabled: boolean) => void;
  setCamera: (enabled: boolean) => void;
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
  const handle = useRef<VideoHandle | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);
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
    setTracks(new Map());
    setMicOn(false);
    setCameraOn(false);
    setLive(false);
    setMuted(new Set());
    setHidden(new Set());
  }

  function start() {
    const current = credentialsRef.current;
    if (Platform.OS === "web" || !current || handle.current || starting.current) return;
    const ticket = generation.current;
    starting.current = true;
    void import("@/media/tableVideoSession").then((mod) => {
      starting.current = false;
      if (ticket !== generation.current || handle.current) return;
      const session = mod.startTableVideo(current, setTracks, setMicOn, () => {
        handle.current = null;
        reset();
      });
      handle.current = session;
      setLive(true);
      setCameraOn(true);
    }).catch(() => {
      starting.current = false;
      reset();
    });
  }

  const visible = new Map(Array.from(tracks).filter(([identity]) => !hidden.has(identity)));

  return {
    tracks: visible,
    micOn,
    cameraOn,
    live,
    muted,
    hidden,
    start,
    setMic(enabled: boolean) {
      if (!handle.current) return;
      handle.current.setMic(enabled);
    },
    setCamera(enabled: boolean) {
      if (!handle.current) return;
      handle.current.setCamera(enabled);
      setCameraOn(enabled);
    },
    toggleMute(identity: string) {
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
