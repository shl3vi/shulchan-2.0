# Shulchan 2.0

Poker table. The table service owns seats and sockets. The poker engine owns the hand. Redis stores both.

```bash
npm run dev
```

That starts Redis, the poker engine, the table service, a Cloudflare tunnel, and Expo. Scan the QR with Expo Go on two phones. Create a table on one, join with that table id on the other, and deal.

Node 24. From the repo root, `nvm install` then `nvm use` (there is an `.nvmrc` in the root, `client`, `table`, and `poker-engine`).

Docker and `cloudflared` need to be installed. `brew install cloudflared` if the tunnel command is missing.
