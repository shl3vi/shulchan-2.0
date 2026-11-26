# Shulchan 2.0

Video game tables: poker, backgammon, dice (five dice, a 13-box scorecard) and tiles (tile rummy). The table service owns seats, sockets, admin, pause and idle closing, and keeps each table in Postgres. Each game's rules run in its own engine service, which the table calls over HTTP. Redis carries the lock, sign-ins and "table changed" messages between table processes.

```bash
npm run dev
```

That starts Redis, LiveKit, the poker, backgammon, dice and tiles engines, the table service, and a Cloudflare tunnel. Then, from `client/`:

```bash
npx expo run:android
```

Node 24. In each terminal, run `nvm use` after you enter the repo. The `.nvmrc` files do not switch the shell on their own.

Docker and `cloudflared` need to be installed. `brew install cloudflared` if the tunnel command is missing.

LiveKit runs in Docker on this Mac. Phones must be on the same Wi-Fi so the video can reach it. Expo Go cannot load the camera SDK, so use the dev build from `npx expo run:android`.

## Games

Each game lives in two folders, one on each side, and nothing shared names a game:

- `table/src/games/<kind>/`: the server side. It implements `GameModule` in `table/src/games/types.ts`: opening a table, seats, its part of the snapshot (`view`), its moves, its stored deadline (turn clock, auto-deal), its app config section, its engine health and its debug page.
- `client/src/games/<kind>/`: the app side. It implements `GameEntry` in `client/src/games/types.ts`: the table screen, the lobby card and the opening form.
- One line in each list of games: `table/src/games/index.ts` and `client/src/games/registry.ts`.
- Its engine service, `<kind>-engine/`, started from `scripts/dev.mjs` and deployed as its own Railway service.

The snapshot every phone gets is the shared part (players, you, pause, idle), a shared `status` (phase, whose move, turn deadline), and the game's own part under `game`. Every game move is one `move` socket event, `{ type, ...input }`. A refused move comes back as `error` with a `code` the app translates. The stored table is `{ v: 2, ...shared, game: { kind, ... } }`.

To remove a game, delete its two folders and its engine, and its line in each list and in `scripts/dev.mjs`. Typecheck and tests then pass with nothing else changed. A test on each side (`games/boundaries.test.ts`) fails if shared code imports a game folder or one game imports another.

`docs/game-separation.html` shows both sides as diagrams.

Every game has a permanent debug table, switched on by `DEBUG_<PREFIX>_TABLE_ID` and `DEBUG_<PREFIX>_DASHBOARD_ID` (at least 16 characters), with an optional six-digit `DEBUG_<PREFIX>_TABLE_PASSWORD`. Its page at `/dev/<kind>/<dashboard id>` adds players and plays for whoever is to act. The prefixes are `DEBUG` (poker), `DEBUG_BG`, `DEBUG_DICE` and `DEBUG_TILES`.

Tests: `npm test --prefix table` and `npm test --prefix client`. Typecheck: `npm run typecheck` in either.

## Cloud

Railway hosts Redis, Postgres, the table service (`shulchan-server`), and one engine service per game. The engines have no public domain. The table reaches them on Railway's private network and sends `ENGINE_TOKEN`, the same value set on every service. The poker engine checks each betting action, the backgammon engine rolls the dice and checks every move, the dice engine rolls and scores every box, and the tiles engine shuffles, deals and checks every set on the table. `/health` fails only when Redis or Postgres is down; each engine is reported on its own. A phone only sends what the player wants to do. The table stores the result. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the table service from the LiveKit Cloud project. Video cannot run on Railway.

An installable APK, from `client/`:

```bash
npx eas-cli@latest build --platform android --profile preview
```

That build talks to `https://loochka.com`. Sideload the APK; it does not need Metro or this Mac.

## Browser

A guest without the app can play in the browser. The table service serves the web build at `/play`, and the share link (`/join`) opens the app when it is installed and `/play/join` when it is not. A browser player can join a table and use camera and mic, but cannot sign in or open a table, and the server never makes them admin. `session.summary` counts `appJoins` and `webJoins`.

`npm run build --prefix table` (Railway's build command) also builds it, into `table/public/play`, which is not in git. If that step fails, the server still deploys, without `/play`, and the link only opens the app. `SKIP_WEB=1` skips it. Set `REQUIRE_WEB=1` on Railway to make a failed browser build fail the whole build instead, so the deploy is refused and the last working version keeps running. To build only the browser version, from `client/`:

```bash
npm run export:web
```
