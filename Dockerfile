# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
# better-sqlite3 compiles from source when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build

FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w apps/server

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080 \
    TZ=Europe/Madrid
# Fonts for text drawn on photos (date captions, welcome picture); the slim image has none.
# Inter covers Latin and Cyrillic; fonts-noto-cjk adds Chinese, Japanese and Korean (~60 MB).
# `upgrade` pulls Debian security fixes newer than the base image.
# npm, npx, corepack and yarn are only needed to build: removing them from the
# runtime image drops the CVEs in their own bundled dependencies.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends fontconfig fonts-inter fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
