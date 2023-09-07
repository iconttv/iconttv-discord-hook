FROM node:20-slim

LABEL title="iconttv-discord-hook"
LABEL version="1.0"

WORKDIR /app

COPY .env .

COPY . .

RUN yarn install --frozen-lockfile

ENV NODE_ENV=production

CMD ["yarn", "start"]