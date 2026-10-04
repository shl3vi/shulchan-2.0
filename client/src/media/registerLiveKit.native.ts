import { registerGlobals } from "@livekit/react-native";

const leaveRequest = "Received leave request while trying to (re)connect";
let consolePatched = false;

export function registerLiveKit() {
  registerGlobals();
  if (consolePatched) return;
  consolePatched = true;
  const report = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => typeof arg === "string" && arg.includes(leaveRequest))) return;
    report(...args);
  };
}
