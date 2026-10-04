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

  room.on(RoomEvent.TrackSubscribed, sync);
  room.on(RoomEvent.TrackUnsubscribed, sync);
  room.on(RoomEvent.LocalTrackPublished, sync);
  room.on(RoomEvent.Disconnected, () => onTracks(new Map()));

  void (async () => {
    const session = await liveKitToken(credentials.gameId, credentials.playerId, credentials.playerSecret);
    if (stopped) return;
    await room.connect(session.url, session.token);
    await room.localParticipant.setCameraEnabled(true);
    await room.localParticipant.setMicrophoneEnabled(true);
    if (stopped) return;
    onMic(true);
    sync();
  })().catch((error) => {
    console.warn("LiveKit failed", error);
  });

  return {
    disconnect() {
      stopped = true;
      room.disconnect();
    },
    toggleMic() {
      const enabled = room.localParticipant.isMicrophoneEnabled ?? false;
      void room.localParticipant.setMicrophoneEnabled(!enabled);
      onMic(!enabled);
    },
  };
}
