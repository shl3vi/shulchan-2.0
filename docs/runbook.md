# Runbook: when something is down

What players see, what the server does on its own, and what to do by hand.

## What happens on its own

- **Players see it.** A seated player whose connection drops for more than 2 seconds gets a full-screen notice, in their language, that the server is down and will be back shortly and that their seat is saved. Nothing behind it can be tapped, and nothing tapped earlier is sent late. It goes away by itself when the connection is back.
- **Tables wait it out.** Every 10 seconds the table service notes that it is working (`alive` table in Postgres, row `server`), and that each engine answers (rows `engine:<kind>`). After a gap of more than 30 seconds, the first sweep back gives every table that time back: the idle fuse, the hour a pause may last, the stored expiry and the game's own clocks (the poker turn clock and the next deal). So a table is not closed, and nobody is folded, for time nobody could play.
- **One engine down.** While a game's engine does not answer, that game's tables are not timed out, closed or deleted. When it answers again they get the time back. The other games are not affected.
- **Sign-ins survive.** Host sign-ins and Apple accounts are in Postgres (`host_sessions`, `apple_accounts`), so losing Redis signs nobody out. Redis only holds the table lock, "table changed" messages and short sign-in steps; anyone in the middle of signing in starts again.

## Restart order

Railway starts services in any order, and that is fine: the table service waits for Postgres and Redis at start, and an engine that is not up yet only holds back its own game.

If everything is down, start in this order to get players back fastest:

1. Postgres and Redis.
2. The engines (poker, backgammon, dice, tiles).
3. `shulchan-server`.

Then open `https://loochka.com/health`. It must show `ok: true`, and `true` for each engine.

## Checks

- **Logs** of `shulchan-server` after an outage show `server was down for Ns: gave the time back to N tables`, or `<kind> was down …` for one engine.
- **`/health`** fails only when Redis or Postgres is down. An engine is reported on its own.

## What to tell players

Nothing, in most cases: the app already says the server is down and will be back, and the game carries on where it stopped. For a long outage (more than about 15 minutes), a short note on the store pages or social accounts helps.

## Restoring the database

There are no scheduled backups. Tables last at most an hour, sign-ins are recreated by signing in again, and blocks and reports are tied to a phone, not to an account. If the Postgres volume is lost, the table service recreates every table at start. Hosts sign in again, and open tables are gone.
