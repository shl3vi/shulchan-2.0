import { Room, RoomEvent, Track, type VideoTrack } from "livekit-client";
import { liveKitToken } from "@/game/api";
import type { Credentials } from "@/game/types";
import { registerLiveKit } from "@/media/registerLiveKit";

export function startTableVideo(
  credentials: Credentials,
  onTracks: (tracks: Map<string, VideoTrack>) => void,
  onMic: (on: boolean) => void,
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

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    onTracks(new Map());
    onMic(false);
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
  room.on(RoomEvent.Disconnected, () => {
    onTracks(new Map());
    onMic(false);
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
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(false);
      if (stopped) {
        await room.localParticipant.setCameraEnabled(false);
        room.disconnect();
        return;
      }
      onMic(false);
      sync();
    } catch {
      shutdown();
    }
  })();

  return {
    disconnect: shutdown,
    setMic(enabled: boolean) {
      if (stopped) return;
      void room.localParticipant.setMicrophoneEnabled(enabled).catch(() => shutdown());
      onMic(enabled);
    },
  };
}
