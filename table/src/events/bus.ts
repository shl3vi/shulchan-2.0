export type ErrorArea = "auth" | "validation" | "forbidden" | "action" | "store" | "video" | "subscriber";

export type EventName = "session.summary" | "error" | "server.heartbeat";

export type AppEvent = {
  id: string;
  name: EventName;
  at: string;
  tableId?: string;
  kind?: "poker" | "backgammon";
  data: Record<string, string | number | boolean>;
};

type Listener = (event: AppEvent) => void;

const listeners: { name: string; hear: Listener }[] = [];
let sinking = false;

export function subscribe(name: string, hear: Listener) {
  listeners.push({ name, hear });
}

export function publish(input: Omit<AppEvent, "id" | "at">) {
  const event: AppEvent = { ...input, id: crypto.randomUUID(), at: new Date().toISOString() };
  for (const listener of listeners) {
    try {
      listener.hear(event);
    } catch (error) {
      const subscriberFault = event.name === "error" && event.data.area === "subscriber";
      console.error("Event subscriber failed", listener.name, error instanceof Error ? error.message : error);
      if (sinking || subscriberFault) continue;
      sinking = true;
      try {
        publish({ name: "error", data: { area: "subscriber", listener: listener.name } });
      } finally {
        sinking = false;
      }
    }
  }
}
