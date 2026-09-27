FROM node:22-bookworm-slim

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev || test -d node_modules/express

COPY server/src ./src
COPY server/tsconfig.json ./

ENV NODE_ENV=production
CMD ["npm", "start"]
