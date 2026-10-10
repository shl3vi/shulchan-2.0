# Shulchan 2.0

Poker table. The table service owns seats and sockets. The poker engine owns the hand. Redis stores both.

```bash
npm run dev
```

That starts Redis, LiveKit, the poker engine, the table service, and a Cloudflare tunnel. Then, from `client/`:

```bash
npx expo run:android
```

Node 24. In each terminal, run `nvm use` after you enter the repo. The `.nvmrc` files do not switch the shell on their own.

Docker and `cloudflared` need to be installed. `brew install cloudflared` if the tunnel command is missing.

LiveKit runs in Docker on this Mac. Phones must be on the same Wi-Fi so the video can reach it. Expo Go cannot load the camera SDK, so use the dev build from `npx expo run:android`.

## Cloud

`render.yaml` is the Render blueprint: Redis, the poker engine (`shulchan-poker`), and the table (`shulchan-server`). Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the table service from the LiveKit Cloud project. Video cannot run on Render.

An installable APK, from `client/`:

```bash
npx eas-cli@latest build --platform android --profile preview
```

That build talks to `https://shulchan-server.onrender.com`. Sideload the APK; it does not need Metro or this Mac.
