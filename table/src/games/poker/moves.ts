import { z } from "zod";
import { EngineRefused } from "../../engines.js";
import { TableRefused } from "../../errors.js";
import { notePlayers } from "../../events/ledger.js";
import { assertPlaying, noteActivity } from "../../idle.js";
import { seatedCount } from "../../players.js";
import { TABLE_UNCHANGED } from "../../store.js";
import type { AfterContext, GameMove } from "../types.js";
import { dropRemovedPlayers, foldDeparted } from "./departures.js";
import { actPoker, addChips, readPoker, setPokerBlinds, startPoker } from "./engine.js";
import { AUTO_DEAL_DELAY_MS, pokerOf } from "./state.js";
import { actBody, autoDealBody, MAX_CHIPS, rebuyBody, tableSettingsBody, turnTimeBody } from "./schema.js";
import { notePoker } from "./tally.js";
import { restartTurn } from "./turn.js";

type HandMark = { round: Parameters<typeof notePoker>[1]; seated: number };

async function noteHand(context: AfterContext, mark: HandMark | undefined) {
  if (!mark) return;
  await notePoker(context.tableId, mark.round);
  await notePlayers(context.tableId, mark.seated);
}

const autoDeal: GameMove<z.infer<typeof autoDealBody>> = {
  schema: autoDealBody,
  failure: "Cannot change automatic dealing",
  async run({ table, requireAdmin }, input) {
    requireAdmin();
    const state = pokerOf(table);
    state.autoDeal = input.enabled;
    // Turning it on while the table waits deals after the usual wait, not at once.
    if (input.enabled && state.view?.round == null) state.autoDealAt = Date.now() + AUTO_DEAL_DELAY_MS;
  },
};

const turnTime: GameMove<z.infer<typeof turnTimeBody>> = {
  schema: turnTimeBody,
  failure: "Cannot change the turn time",
  async run({ table, requireAdmin }, input) {
    requireAdmin();
    const state = pokerOf(table);
    if (state.turnSeconds === input.seconds) return TABLE_UNCHANGED;
    state.turnSeconds = input.seconds;
    // The player acting now gets the new length in full, so the change shows at once.
    if (table.paused !== true) restartTurn(state, Date.now());
  },
};

const tableSettings: GameMove<z.infer<typeof tableSettingsBody>> = {
  schema: tableSettingsBody,
  failure: "Cannot change the table settings",
  async run({ table, requireAdmin }, input) {
    requireAdmin();
    const state = pokerOf(table);
    const view = await readPoker(table);
    const blinds = input.smallBlind ?? view.nextSmallBlind ?? state.smallBlind;
    const buyIn = input.buyIn ?? state.buyIn;
    // Same rule as opening a table, checked against the blinds the next hand will use.
    if (buyIn < blinds * 2) throw new TableRefused("invalid", "Buy-in must be at least one big blind");
    if (input.smallBlind != null && input.smallBlind !== (view.nextSmallBlind ?? state.smallBlind)) {
      await setPokerBlinds(table, input.smallBlind);
    }
    if (input.buyIn != null) state.buyIn = input.buyIn;
    if (input.rebuy != null) state.rebuy = input.rebuy;
  },
};

const startHand: GameMove<object, HandMark> = {
  schema: z.object({}).strict(),
  failure: "Cannot start",
  async run({ table, requireAdmin }) {
    requireAdmin();
    assertPlaying(table);
    const view = await startPoker(table).catch((error: unknown) => {
      // The engine's reason, given a code so the app can say it in the player's language.
      if (error instanceof EngineRefused && error.message === "At least two players need chips to deal.") {
        throw new TableRefused("invalid", error.message, "poker.need-two-with-chips");
      }
      throw error;
    });
    noteActivity(table, Date.now());
    await dropRemovedPlayers(table);
    return { round: view.round, seated: seatedCount(table) };
  },
  after: noteHand,
};

const rebuy: GameMove<z.infer<typeof rebuyBody>> = {
  schema: rebuyBody,
  failure: "Buy-in failed",
  async run({ table, seat }, input) {
    const state = pokerOf(table);
    const amount = input.amount;
    if (!Number.isInteger(amount) || amount < 1 || amount > state.buyIn) {
      throw new TableRefused("invalid", "Buy-in must be a whole number up to the table buy-in");
    }
    const rule = state.rebuy ?? "any";
    if (rule === "off") throw new TableRefused("invalid", "Rebuys are off at this table");
    if (rule === "busted") {
      const entry = (await readPoker(table)).seats.find((item) => item.seat === seat.seat);
      if ((entry?.stack ?? 0) > 0 || entry?.inHand) throw new TableRefused("invalid", "You can buy more chips once you have none left");
    }
    await addChips(table, seat.seat, amount);
    state.bought[seat.id] = (state.bought[seat.id] ?? state.buyIn) + amount;
  },
};

const act: GameMove<z.infer<typeof actBody>, HandMark> = {
  schema: actBody,
  check(input) {
    if (input.action !== "bet" && input.action !== "raise") return null;
    const amount = input.amount;
    const fits = amount != null && Number.isInteger(amount) && amount >= 1 && amount <= MAX_CHIPS;
    return fits ? null : { message: "Bet size is outside the allowed range", code: "poker.bet-range" };
  },
  failure: "Action failed",
  async run({ table, seat }, input) {
    assertPlaying(table);
    await actPoker(table, seat.seat, input.action, input.amount);
    noteActivity(table, Date.now());
    await foldDeparted(table);
    await dropRemovedPlayers(table);
    const view = await readPoker(table);
    return { round: view.round, seated: seatedCount(table) };
  },
  after: noteHand,
};

/** By move type. The app sends `{ type: "act", action, amount }` and so on. */
export const pokerMoves: Record<string, GameMove> = {
  act,
  deal: startHand,
  rebuy,
  autoDeal,
  turnTime,
  settings: tableSettings,
};
