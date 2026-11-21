import { z } from "zod";

const tile = z.string().regex(/^([rbok](1[0-3]|[1-9])[ab]|j[12])$/);

/** Each move's input, without its `type`. */
export const moveInputs = {
  start: z.object({}).strict(),
  /** The whole table as the player leaves it: every set, old tiles and new. */
  play: z.object({ table: z.array(z.array(tile).max(13)).max(60) }).strict(),
  draw: z.object({}).strict(),
};

export type TilesAction = { type: "draw" } | ({ type: "play" } & z.infer<typeof moveInputs.play>);

/** The tile game has nothing to choose before the table opens. */
export const openBody = z.object({ kind: z.literal("tiles") }).strict();

export type TilesSettings = Record<string, never>;
