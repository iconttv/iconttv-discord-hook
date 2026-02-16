FROM node:24 AS builder

WORKDIR /app

RUN corepack enable && corepack prepare yarn@4.10.3 --activate

COPY package.json ./
COPY yarn.lock ./
COPY .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM node:24-slim

LABEL title="iconttv-discord-hook"
LABEL version="1.0"

WORKDIR /app

RUN corepack enable && corepack prepare yarn@4.10.3 --activate

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/yarn.lock /app/yarn.lock
COPY --from=builder /app/.yarnrc.yml /app/.yarnrc.yml

RUN cd /app \
 && mkdir /app/database \
 && chmod 777 /app/database

ENV NODE_ENV=prod
ENV MAX_OLD_SPACE_SIZE=4096

ENTRYPOINT ["sh", "-c", "node --max-old-space-size=${MAX_OLD_SPACE_SIZE} $0 $@"]

CMD ["dist/index.js"]
