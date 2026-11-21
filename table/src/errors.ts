/**
 * A request the table turns down on purpose. Shared code reports it by `reason`, never by its text.
 * The text is what the player sees, and the app may match it to show a translation.
 */
export class TableRefused extends Error {
  constructor(readonly reason: "forbidden" | "invalid", message: string) {
    super(message);
  }
}
