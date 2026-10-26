import { PostHog } from "posthog-node";
import { subscribe, type AppEvent } from "./bus.js";

const apiKey = process.env.POSTHOG_API_KEY?.trim() ?? "";
const host = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

const client = apiKey ? new PostHog(apiKey, { host }) : null;

function distinctId(event: AppEvent) {
  if (event.name === "server.heartbeat" || !event.tableId) return "server";
  return `table:${event.tableId}`;
}

export function capture(event: AppEvent) {
  if (!client) return;
  client.capture({
    distinctId: distinctId(event),
    event: event.name,
    properties: {
      $insert_id: event.id,
      ...(event.tableId ? { tableId: event.tableId } : {}),
      ...(event.kind ? { kind: event.kind } : {}),
      ...event.data,
    },
    ...(event.tableId ? { groups: { table: event.tableId } } : {}),
  });
}

export function listenPosthog() {
  subscribe("posthog", capture);
}

export async function shutdownPosthog() {
  if (!client) return;
  await client.shutdown();
}
