import type { Router } from "express";
import type { ZodType } from "zod";
import type { KindedTable, SeatPlayer, TableRecord } from "../store.js";

/**
 * What every game gives the shared table code. Shared code reaches a game only through
 * this contract, by way of `gameOf(table)` in games/index.ts, and never names a game.
 */

/** A new table before its game has set it up: everything shared, nothing about the game. */
export type NewTable = Pick<TableRecord, "id" | "password" | "players"> &
  Partial<Pick<TableRecord, "adminSecret" | "hostEmail" | "lastActivityAt">>;

/** Given to a move while it holds the table lock. The move may run again after a save conflict, so it only changes `table`. */
export type MoveContext = {
  table: TableRecord;
  /** The player who sent the move, as seated on `table`. */
  seat: SeatPlayer;
  /** Throws unless the sender is the table admin. */
  requireAdmin(): void;
};

/** Given to a move's `after`, once the table is saved and published, or once the move was refused. */
export type AfterContext = {
  tableId: string;
  /** Sends this phone the table as stored, for a move it already showed but the server refused. */
  resync(): Promise<void>;
};

export type GameMove<Input = any, Result = any> = {
  schema: ZodType<Input>;
  /** Sent back when the body does not parse. "Invalid request" when left out. */
  invalidMessage?: string;
  /** A check the schema cannot express. Returns the message to send back, or null. */
  check?(input: Input): string | null;
  /** Sent back when `run` throws something without a message. */
  failure: string;
  run(context: MoveContext, input: Input): Promise<Result>;
  /** Runs after the save. `result` is undefined when the move was refused or changed nothing. */
  after?(context: AfterContext, result: Result | undefined): Promise<void>;
};

/** The page and routes behind /dev/<path>/<token> for one game's permanent debug table. */
export type GameDebug<Settings = OpenSettings> = {
  /** Mounted at /dev/<path>. */
  path: string;
  /** Environment variable prefix, e.g. DEBUG for DEBUG_TABLE_ID and DEBUG_DASHBOARD_ID. */
  envPrefix: string;
  /** Prefixes whose table settings this game falls back on, in order, after its own. */
  fallbackPrefixes?: string[];
  label: string;
  /** The debug table's settings. `read("SMALL_BLIND")` reads <prefix>_TABLE_SMALL_BLIND, then the fallback prefixes. */
  settings(read: (name: string) => string | undefined): { settings: Settings } | { error: string };
  page(): string;
  state(table: TableRecord): Promise<unknown>;
  /** Brings a debug table stored by an older version up to date. */
  repair(tableId: string): Promise<void>;
  /** Clears the game when the debug table is reset. Shared fields are cleared by the caller. */
  reset(table: TableRecord): Promise<void>;
  /** Game-only routes, each answering with the debug state. */
  routes(router: Router, respond: DebugResponder): void;
};

/** Runs a debug change on the debug table and answers with its state, or with the error. */
export type DebugResponder = (res: import("express").Response, run: (tableId: string) => Promise<void>) => Promise<void>;

/** Settings sent when a table is opened, already checked by the game. Only the game reads them. */
export type OpenSettings = object;

export type GameModule<Settings extends OpenSettings = OpenSettings> = {
  /** The most players seated at once. */
  seats: { max: number };
  /** Reads and checks the body of "open a table". Returns the settings, or the message to send back with a 400. */
  settings(body: unknown): { settings: Settings } | { error: string };
  /** Sets up the game on a new table. */
  open(table: NewTable, settings: Settings): Promise<KindedTable>;
  /** The seat a joining player gets, or undefined when the table is full. */
  chooseSeat(taken: number[], avoid: number[]): number | undefined;
  /** Seats a player the shared code has just created. */
  seat(table: TableRecord, player: SeatPlayer): Promise<void>;
  /** Takes a leaving player out of the game. They stay listed until `dropDeparted` lets them go. */
  unseat(table: TableRecord, player: SeatPlayer): Promise<void>;
  /** Removes leaving players the game no longer needs. */
  dropDeparted(table: TableRecord): Promise<void>;
  /** What one viewer, or nobody, sees of the table. */
  snapshot(table: TableRecord, viewerId?: string, blockedIds?: Set<string>): Promise<unknown>;
  /** Socket events this game accepts, by event name. */
  moves: Record<string, GameMove>;
  /** After any saved change to the table. */
  changed?(tableId: string): void;
  /** After every publish, on every table process: start or stop this process's timers. */
  arm?(table: TableRecord): void;
  /** From the idle sweep: act on timers lost to a restart. */
  sweep?(table: TableRecord, now: number): Promise<void>;
  /** The admin resumed a paused table. */
  resume?(table: TableRecord, now: number): void;
  /** True when this game's engine service answers. */
  health(): Promise<boolean>;
  debug?: GameDebug<Settings>;
};

export function defineGame<Settings extends OpenSettings>(game: GameModule<Settings>): GameModule<Settings> {
  return game;
}
