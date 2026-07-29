# syntax=docker/dockerfile:1

# ── Frontend build ──────────────────────────────────────────
FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ── Server dependencies (native modules) ────────────────────
FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libvips42 \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 mtg \
  && useradd --uid 1001 --gid mtg --shell /usr/sbin/nologin --create-home mtg

WORKDIR /app

COPY --chown=mtg:mtg server/package.json server/package-lock.json ./server/
COPY --chown=mtg:mtg server/*.js ./server/
COPY --from=server-deps --chown=mtg:mtg /app/server/node_modules ./server/node_modules
COPY --from=client-build --chown=mtg:mtg /app/client/dist ./client/dist

RUN mkdir -p /data && chown mtg:mtg /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3847 \
    DATA_DIR=/data

EXPOSE 3847
VOLUME ["/data"]

USER mtg
WORKDIR /app/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3847)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
