import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VideoTrack } from "livekit-client";
import { videoFor } from "@/game/remoteConfig";
import type { GameKind } from "@/games/registry";
import type { Credentials } from "@/game/types";
import { allowCapture } from "@/media/capturePermission";
import { videoSupported } from "@/media/videoSupport";
import type { MessageKey } from "@/i18n";

/** How long a tile keeps the last picture while the shutter closes. */
const SHUTTER_MS = 800;

type VideoHandle = {
  disconnect: (failed?: boolean) => void;
  setMic: (enabled: boolean) => Promise<unknown>;
  setCamera: (enabled: boolean) => Promise<unknown>;
  mute: (identity: string, muted: boolean) => void;
  hide: (identity: string, hidden: boolean) => void;
  block: (ids: string[]) => void;
};

export function useTableVideo(credentials: Credentials | null, suspended: boolean, kind: GameKind) {
  const [tracks, setTracks] = useState<Map<string, VideoTrack>>(new Map());
  /** Tracks whose camera just went off. They stay on the tile while the shutter closes. */
  const [leaving, setLeaving] = useState<Map<string, VideoTrack>>(new Map());
  const shown = useRef<Map<string, VideoTrack>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [live, setLive] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  /** A note shown over the table: this device has no video, or the browser was told no. */
  const [videoNotice, setVideoNotice] = useState<MessageKey | null>(null);
  const handle = useRef<VideoHandle | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);
  const desired = useRef({ camera: false, mic: false });
  const held = useRef<Set<string>>(new Set());
  // The latest props, for the async video callbacks. Updated after each render, before effects run.
  const credentialsRef = useRef(credentials);
  const suspendedRef = useRef(suspended);
  const kindRef = useRef(kind);
  useLayoutEffect(() => {
    credentialsRef.current = credentials;
    suspendedRef.current = suspended;
    kindRef.current = kind;
  });

  const gameId = credentials?.gameId;
  const playerId = credentials?.playerId;
  const playerSecret = credentials?.playerSecret;

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

  // Pausing turns video off. The shown state is reset while rendering; the call is ended in the effect.
  const [wasSuspended, setWasSuspended] = useState(suspended);
  if (suspended !== wasSuspended) {
    setWasSuspended(suspended);
    if (suspended) {
      setTracks(new Map());
      setMicOn(false);
      setCameraOn(false);
      setLive(false);
    }
  }
  useEffect(() => {
    if (!suspended) return;
    desired.current = { camera: false, mic: false };
    starting.current = false;
    handle.current?.disconnect();
    handle.current = null;
  }, [suspended]);

  function ensure() {
    const current = credentialsRef.current;
    if (suspendedRef.current || !videoSupported || !current || handle.current || starting.current) return;
    const ticket = generation.current;
    starting.current = true;
    void import("@/media/tableVideoSession").then((mod) => {
      starting.current = false;
      if (ticket !== generation.current || handle.current || suspendedRef.current) return;
      const session = mod.startTableVideo(current, setTracks, setMicOn, () => {
        handle.current = null;
        reset();
      }, desired.current, videoFor(kindRef.current), (denied) => {
        desired.current[denied === "camera" ? "camera" : "mic"] = false;
        if (denied === "camera") setCameraOn(false);
        else setMicOn(false);
        setVideoNotice("videoBlocked");
      });
      if (ticket !== generation.current || suspendedRef.current) {
        session.disconnect();
        return;
      }
      session.block([...held.current]);
      handle.current = session;
      setLive(true);
    }).catch(() => {
      starting.current = false;
      reset();
    });
  }

  useEffect(() => {
    const before = shown.current;
    shown.current = tracks;
    const gone = [...before].filter(([identity]) => !tracks.has(identity));
    setLeaving((current) => {
      const next = new Map(current);
      for (const identity of tracks.keys()) next.delete(identity);
      for (const [identity, track] of gone) next.set(identity, track);
      return next.size === current.size && [...next].every(([identity, track]) => current.get(identity) === track) ? current : next;
    });
    if (gone.length === 0) return;
    const timer = setTimeout(() => {
      setLeaving((current) => {
        const next = new Map(current);
        for (const [identity, track] of gone) if (next.get(identity) === track) next.delete(identity);
        return next;
      });
    }, SHUTTER_MS);
    return () => clearTimeout(timer);
  }, [tracks]);

  useEffect(() => {
    for (const id of held.current) {
      handle.current?.mute(id, true);
      handle.current?.hide(id, true);
    }
  }, [tracks]);

  const visible = new Map(Array.from(tracks).filter(([identity]) => !hidden.has(identity)));
  const closing = new Set<string>();
  for (const [identity, track] of leaving) {
    if (visible.has(identity) || hidden.has(identity)) continue;
    visible.set(identity, track);
    closing.add(identity);
  }

  return {
    videoNotice,
    dismissVideoNotice() {
      setVideoNotice(null);
    },
    tracks: visible,
    /** Players whose camera just went off: their tile closes the shutter, then shows their initial. */
    closing,
    micOn,
    cameraOn,
    live,
    muted,
    hidden,
    setMic(enabled: boolean) {
      if (suspendedRef.current || !videoSupported) return;
      void (async () => {
        if (enabled && !(await allowCapture("microphone"))) enabled = false;
        if (suspendedRef.current) return;
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
      if (suspendedRef.current) return;
      if (!videoSupported) {
        if (enabled) setVideoNotice("videoUnsupported");
        return;
      }
      void (async () => {
        if (enabled && !(await allowCapture("camera"))) enabled = false;
        if (suspendedRef.current) return;
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
      handle.current?.block([...next]);
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
