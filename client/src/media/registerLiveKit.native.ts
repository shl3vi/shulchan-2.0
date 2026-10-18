import { AudioSession, registerGlobals } from "@livekit/react-native";

const ignored = ["Received leave request while trying to (re)connect", "NegotiationError"];
let consolePatched = false;

export function registerLiveKit() {
  registerGlobals();
  void AudioSession.configureAudio({
    android: { preferredOutputList: ["speaker"] },
  }).then(() => AudioSession.startAudioSession());
  if (consolePatched) return;
  consolePatched = true;
  const report = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === "string" && ignored.some((text) => arg.includes(text)))) return;
    report(...args);
  };
}
