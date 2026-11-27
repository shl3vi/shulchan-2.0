import { t, type MessageKey } from "@/i18n";

/**
 * An error the server sent, with its code. The app shows the translation of the code, never the
 * server's English text. A game's screen adds its own codes, prefixed with its kind ("poker.bet-range").
 */
export class ServerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** The codes every table shares. One missing here, or from a game's own list, shows "something went wrong". */
const SHARED: Record<string, MessageKey> = {
  failed: "errFailed",
  invalid: "errFailed",
  "too-many": "errTooMany",
  paused: "tablePaused",
  closing: "tableClosing",
  "not-admin": "errNotAdmin",
  "not-your-turn": "errNotYourTurn",
  "game-over": "errGameOver",
  watching: "errWatching",
  "needs-two": "errNeedsTwo",
  "not-started": "errNotStarted",
  busy: "errBusy",
  "engine-slow": "errEngineSlow",
  "engine-down": "errEngineDown",
  "not-found": "errNotFound",
  "not-seated": "leftTable",
  "player-gone": "errPlayerGone",
  "browser-admin": "errBrowserAdmin",
  "sign-in-needed": "errSignInNeeded",
  "table-limit": "errTableLimit",
  "name-length": "errNameLength",
  "name-blocked": "nameRejected",
  "wrong-password": "errWrongPassword",
  "password-attempts": "errPasswordAttempts",
  "table-full": "errTableFull",
  "seat-needed": "couldNotJoin",
  "video-off": "errVideoOff",
  "report-failed": "reportFailed",
  "block-failed": "blockFailed",
  "sign-in-expired": "errSignInExpired",
  "sign-in-attempts": "errSignInAttempts",
  "apple-off": "errAppleOff",
  "apple-refused": "errAppleRefused",
  "apple-unavailable": "errAppleUnavailable",
  "apple-no-email": "errAppleNoEmail",
};

/** The player's words for a code: the game's own list first, then the shared one, then "something went wrong". */
export function codeText(code: string | null | undefined, game: Record<string, MessageKey> = {}) {
  if (code && Object.hasOwn(game, code)) return t(game[code]!);
  if (code && Object.hasOwn(SHARED, code)) return t(SHARED[code]!);
  return t("errFailed");
}

/** The code of a caught error, or null when it is not one the server sent. */
export function errorCode(cause: unknown) {
  return cause instanceof ServerError ? cause.code : null;
}

/**
 * The player's words for anything a request threw. A server error is translated by its code. Anything
 * else means the server could not be reached, or the request broke on the phone: `fallback` says which.
 */
export function errorText(cause: unknown, fallback: MessageKey = "serverUnreachable") {
  if (cause instanceof ServerError) return codeText(cause.code);
  return t(fallback);
}
