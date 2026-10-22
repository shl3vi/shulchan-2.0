import { Room, RoomEvent, Track, type VideoTrack } from "livekit-client";
import { liveKitToken } from "@/game/api";
import type { Credentials } from "@/game/types";
import { allowCapture } from "@/media/capturePermission";
import { registerLiveKit } from "@/media/registerLiveKit";

export function startTableVideo(
  credentials: Credentials,
  onTracks: (tracks: Map<string, VideoTrack>) => void,
  onMic: (on: boolean) => void,
  onDown: () => void,
  desired: { camera: boolean; mic: boolean },
) {
  registerLiveKit();
  const room = new Room();
  let stopped = false;

  const sync = () => {
    const videos = new Map<string, VideoTrack>();
    const add = (identity: string, participantTracks: { getTrackPublication: (source: Track.Source) => { track?: Track } | undefined }) => {
      const publication = participantTracks.getTrackPublication(Track.Source.Camera);
      if (publication?.track?.kind === Track.Kind.Video) videos.set(identity, publication.track as VideoTrack);
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
    })();
  };

  room.on(RoomEvent.TrackSubscribed, sync);
  room.on(RoomEvent.TrackUnsubscribed, sync);
  room.on(RoomEvent.LocalTrackPublished, sync);
  room.on(RoomEvent.LocalTrackUnpublished, sync);
  room.on(RoomEvent.Disconnected, () => {
    onTracks(new Map());
    onMic(false);
    if (!stopped) onDown();
  });

  void (async () => {
    try {
      const session = await liveKitToken(credentials.gameId, credentials.playerId, credentials.playerSecret);
      if (stopped) return;
      await room.connect(session.url, session.token);
      if (stopped) {
        room.disconnect();
        return;
      }
      if (desired.camera && (await allowCapture("camera"))) {
        await room.localParticipant.setCameraEnabled(true);
      }
      if (desired.mic && (await allowCapture("microphone"))) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      if (stopped) {
        room.disconnect();
        return;
      }
      onMic(desired.mic);
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
      return room.localParticipant.setMicrophoneEnabled(enabled).catch(() => {
        onMic(false);
      });
    },
    setCamera(enabled: boolean) {
      if (stopped) return Promise.resolve();
      return room.localParticipant.setCameraEnabled(enabled).then(() => sync());
    },
    mute(identity: string, muted: boolean) {
      room.remoteParticipants.get(identity)?.setVolume(muted ? 0 : 1);
    },
    hide(identity: string, hidden: boolean) {
      const publication = room.remoteParticipants.get(identity)?.getTrackPublication(Track.Source.Camera) as { setSubscribed?: (subscribed: boolean) => void } | undefined;
      publication?.setSubscribed?.(!hidden);
    },
  };
}
