import { videoSupported } from "@/media/videoSupport";

const ignored = ["Received leave request while trying to (re)connect", "NegotiationError"];
let consolePatched = false;

export async function registerLiveKit() {
  if (!videoSupported) return;
  const { AndroidAudioTypePresets, AudioSession, registerGlobals } = await import("@livekit/react-native");
  registerGlobals();
  void AudioSession.configureAudio({
    // The voice-call preset is what Android used when this was left out, so nothing changes on the phone.
    android: { preferredOutputList: ["speaker"], audioTypeOptions: AndroidAudioTypePresets.communication },
  }).then(() => AudioSession.startAudioSession());
  if (consolePatched) return;
  consolePatched = true;
  const report = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === "string" && ignored.some((text) => arg.includes(text)))) return;
    report(...args);
  };
}
