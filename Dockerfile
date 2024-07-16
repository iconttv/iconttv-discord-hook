FROM node:20 AS builder

WORKDIR /app

COPY package.json ./
COPY yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM node:20-slim

LABEL title="iconttv-discord-hook"
LABEL version="1.0"

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock

ENV NODE_ENV=prod

CMD ["node", "./dist/index.js"]
