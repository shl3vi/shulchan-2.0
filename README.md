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
