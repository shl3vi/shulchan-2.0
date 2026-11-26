import { Platform } from "react-native";
import { Room, RoomEvent, Track, type RemoteTrack, type VideoTrack } from "livekit-client";
import { liveKitToken } from "@/game/api";
import type { VideoQuality } from "@/game/remoteConfig";
import type { Credentials } from "@/game/types";
import { allowCapture } from "@/media/capturePermission";
import { registerLiveKit } from "@/media/registerLiveKit";

export function startTableVideo(
  credentials: Credentials,
  onTracks: (tracks: Map<string, VideoTrack>) => void,
  onMic: (on: boolean) => void,
  onDown: () => void,
  desired: { camera: boolean; mic: boolean },
  quality: VideoQuality,
  onDenied: (kind: "camera" | "microphone") => void = () => {},
) {
  const web = Platform.OS === "web";
  /**
   * A seat tile is small, so each camera is sent once, at a small size and a capped
   * bitrate (set per region and per game in the server config). Dynacast stops a camera
   * nobody receives. adaptiveStream stays off: remote tiles draw with RTCView, which
   * it cannot see, so it would pause cameras that are on screen.
   */
  const room = new Room({
    dynacast: true,
    videoCaptureDefaults: {
      resolution: { width: quality.width, height: quality.height, frameRate: quality.frameRate },
    },
    publishDefaults: {
      simulcast: false,
      videoEncoding: { maxBitrate: quality.maxKbps * 1000, maxFramerate: quality.frameRate },
    },
    // In a browser, remote voices play through Web Audio, so muting a player works on iPhone Safari too,
    // where an <audio> element's volume cannot be changed.
    ...(web ? { webAudioMix: true } : {}),
  });
  /** Browser only: the hidden <audio> elements remote voices play through. The phone plays them on its own. */
  const voices = new Map<RemoteTrack, HTMLMediaElement>();
  const playVoice = (track: RemoteTrack) => {
    if (!web || track.kind !== Track.Kind.Audio || voices.has(track)) return;
    const element = track.attach();
    element.hidden = true;
    document.body.appendChild(element);
    voices.set(track, element);
  };
  const dropVoice = (track: RemoteTrack) => {
    const element = voices.get(track);
    if (!element) return;
    track.detach(element);
    element.remove();
    voices.delete(track);
  };
  const dropVoices = () => {
    for (const track of [...voices.keys()]) dropVoice(track);
  };
  /** A browser plays sound only after a tap on the page. If it was held back, the next tap starts it. */
  const unlockAudio = () => {
    if (!web || room.canPlaybackAudio) return;
    const start = () => {
      void room.startAudio().catch(() => undefined);
    };
    document.addEventListener("pointerdown", start, { once: true, capture: true });
  };
  let stopped = false;
  let connected = false;
  let blocked = new Set<string>();

  /**
   * Enforced by the LiveKit server: a blocked identity cannot subscribe to this
   * phone's camera or mic. It is an allowlist, so it is rebuilt when someone joins.
   */
  const applyPermissions = () => {
    if (!connected || stopped) return;
    try {
      if (blocked.size === 0) {
        room.localParticipant.setTrackSubscriptionPermissions(true);
        return;
      }
      const allowed = [...room.remoteParticipants.keys()]
        .filter((identity) => !blocked.has(identity))
        .map((identity) => ({ participantIdentity: identity, allowAll: true }));
      room.localParticipant.setTrackSubscriptionPermissions(false, allowed);
    } catch {
      // The signal is gone. The next connect applies it again.
    }
  };

  /** Stop receiving a blocked player's camera and mic, not only hiding them. */
  const applySubscriptions = (identity: string) => {
    const participant = room.remoteParticipants.get(identity);
    if (!participant) return;
    const off = blocked.has(identity);
    for (const source of [Track.Source.Camera, Track.Source.Microphone]) {
      const publication = participant.getTrackPublication(source) as { setSubscribed?: (subscribed: boolean) => void; isSubscribed?: boolean } | undefined;
      if (off && publication?.isSubscribed !== false) publication?.setSubscribed?.(false);
      else if (!off && source === Track.Source.Microphone && publication?.isSubscribed === false) publication?.setSubscribed?.(true);
    }
  };

  /**
   * Turning a camera off mutes it: the track stays published, but no new frames come.
   * A muted camera is left out, so its seat goes dark instead of holding the last frame.
   */
  const sync = () => {
    const videos = new Map<string, VideoTrack>();
    const add = (identity: string, participantTracks: { getTrackPublication: (source: Track.Source) => { track?: Track; isMuted: boolean } | undefined }) => {
      const publication = participantTracks.getTrackPublication(Track.Source.Camera);
      if (publication?.track?.kind === Track.Kind.Video && !publication.isMuted) videos.set(identity, publication.track as VideoTrack);
    };
    add(room.localParticipant.identity, room.localParticipant);
    room.remoteParticipants.forEach((participant) => add(participant.identity, participant));
    onTracks(videos);
  };

  const shutdown = (failed = false) => {
    if (stopped) return;
    stopped = true;
    onTracks(new Map());
    onMic(false);
    if (failed) onDown();
    void (async () => {
      try {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        // The room is already gone. The hand keeps going.
      }
      room.disconnect();
      dropVoices();
    })();
  };

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (blocked.has(participant.identity)) applySubscriptions(participant.identity);
    else playVoice(track);
    sync();
  });
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    applyPermissions();
    if (blocked.has(participant.identity)) applySubscriptions(participant.identity);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    dropVoice(track);
    sync();
  });
  room.on(RoomEvent.AudioPlaybackStatusChanged, unlockAudio);
  room.on(RoomEvent.LocalTrackPublished, sync);
  room.on(RoomEvent.LocalTrackUnpublished, sync);
  room.on(RoomEvent.TrackMuted, sync);
  room.on(RoomEvent.TrackUnmuted, sync);
  room.on(RoomEvent.Disconnected, () => {
    dropVoices();
    onTracks(new Map());
    onMic(false);
    if (!stopped) onDown();
  });

  /**
   * A browser asks for the camera and mic itself. A "no" there ends that one device, not the video:
   * this player still sees and hears the table.
   */
  const capture = async (kind: "camera" | "microphone", enable: () => Promise<unknown>) => {
    try {
      await enable();
      return true;
    } catch (error) {
      if (!web || !denied(error)) throw error;
      onDenied(kind);
      return false;
    }
  };

  void (async () => {
    try {
      await registerLiveKit();
      const session = await liveKitToken(credentials.gameId, credentials.playerId, credentials.playerSecret);
      if (stopped) return;
      await room.connect(session.url, session.token);
      if (stopped) {
        room.disconnect();
        return;
      }
      connected = true;
      applyPermissions();
      blocked.forEach(applySubscriptions);
      // The camera or mic tap that started this is the gesture a browser needs before it plays sound.
      if (web) void room.startAudio().catch(() => undefined).finally(unlockAudio);
      if (desired.camera && (await allowCapture("camera"))) {
        await capture("camera", () => room.localParticipant.setCameraEnabled(true));
      }
      if (desired.mic && (await allowCapture("microphone"))) {
        await capture("microphone", () => room.localParticipant.setMicrophoneEnabled(true));
      }
      if (stopped) {
        room.disconnect();
        return;
      }
      onMic(desired.mic && room.localParticipant.isMicrophoneEnabled);
      sync();
    } catch {
      shutdown(true);
    }
  })();

  return {
    disconnect: shutdown,
    setMic(enabled: boolean) {
      if (stopped) return Promise.resolve();
      onMic(enabled);
      return room.localParticipant.setMicrophoneEnabled(enabled).catch((error: unknown) => {
        if (web && denied(error)) onDenied("microphone");
        onMic(false);
      });
    },
    setCamera(enabled: boolean) {
      if (stopped) return Promise.resolve();
      return room.localParticipant.setCameraEnabled(enabled).then(() => sync(), (error: unknown) => {
        if (web && denied(error)) onDenied("camera");
        throw error;
      });
    },
    mute(identity: string, muted: boolean) {
      room.remoteParticipants.get(identity)?.setVolume(muted ? 0 : 1);
    },
    block(ids: string[]) {
      const previous = blocked;
      blocked = new Set(ids);
      if (stopped || !connected) return;
      applyPermissions();
      for (const identity of new Set([...previous, ...blocked])) applySubscriptions(identity);
    },
    hide(identity: string, hidden: boolean) {
      const publication = room.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.Camera) as { setSubscribed?: (subscribed: boolean) => void } | undefined;
      publication?.setSubscribed?.(!hidden);
    },
  };
}

/** The browser, or the person, said no to the camera or mic, or there is none. */
function denied(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError";
}
