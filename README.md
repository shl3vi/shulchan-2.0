# Shulchan 2.0

Poker table. The table service owns seats, sockets, and the hand. The poker engine only returns the next hand. Redis stores the live table.

```bash
npm run dev
```

That starts Redis, LiveKit, the poker engine, the backgammon engine, the table service, and a Cloudflare tunnel. Then, from `client/`:

```bash
npx expo run:android
```

Node 24. In each terminal, run `nvm use` after you enter the repo. The `.nvmrc` files do not switch the shell on their own.

Docker and `cloudflared` need to be installed. `brew install cloudflared` if the tunnel command is missing.

LiveKit runs in Docker on this Mac. Phones must be on the same Wi-Fi so the video can reach it. Expo Go cannot load the camera SDK, so use the dev build from `npx expo run:android`.

## Cloud

Railway hosts Redis, Postgres, the table service (`shulchan-server`), and separate poker and backgammon engine services. The engines have no public domain. The table reaches them on Railway's private network and sends `ENGINE_TOKEN`, the same value set on all three services. The poker engine checks each betting action, and the backgammon engine rolls the dice and checks every move. A phone only sends what the player wants to do. The table stores the result. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the table service from the LiveKit Cloud project. Video cannot run on Railway.

An installable APK, from `client/`:

```bash
npx eas-cli@latest build --platform android --profile preview
```

That build talks to `https://loochka.com`. Sideload the APK; it does not need Metro or this Mac.

## Browser

A guest without the app can play in the browser. The table service serves the web build at `/play`, and the share link (`/join`) opens the app when it is installed and `/play/join` when it is not. A browser player can join a table and use camera and mic, but cannot sign in or open a table, and the server never makes them admin. `session.summary` counts `appJoins` and `webJoins`.

Build it from `client/` before starting the table service; without it, `/play` is off and the link only opens the app:

```bash
npm run export:web
```

That writes `table/public/play`, which is not in git.
