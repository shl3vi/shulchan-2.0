# Shulchan 2.0

Poker table split into a Node server and a React Native client.

## Server

Express 5 and Socket.IO. No Vite. Rules stay on the server via `poker-ts`. Tables live in memory.

```bash
cd server
npm install
npm run dev
```

Listens on `http://127.0.0.1:4000`.

- `POST /api/games` `{ smallBlind, buyIn }` creates a table and returns `gameId` and `adminSecret`
- `POST /api/games/:id/join` `{ name }` sits a player and returns `id` and `secret`
- Socket.IO namespace `/poker`, auth `{ gameId, playerId, playerSecret }`
- Events: `start-hand` `{ adminSecret }`, `act` `{ action, amount }`, server pushes `state`

## Client

Expo SDK 57, expo-router, React Native. Session and socket actions live in `src/game/GameSession.tsx`. Screens only render that session.

```bash
cd client
npm install
npm start
```

The app calls `https://shulchan-table.onrender.com`. Set `EXPO_PUBLIC_API_URL` to override that, for example `http://127.0.0.1:4000` when the server is running on this machine. The free Render instance sleeps when idle, so the first request after a pause can take half a minute. Tables are kept in memory and disappear when the instance restarts.

This machine's Node is older than the version React Native 0.86 asks for (`>=20.19.4`). Upgrade Node before running the client.
