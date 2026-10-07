# syntax=docker/dockerfile:1.7
#
# Imagen del API. Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t fedesoft-api .
#
# Una sola imagen, dos órdenes:
#   (por defecto)  node apps/api/dist/main.js             → sirve el API
#   migrate                                               → aplica migraciones
#                                                           (con MIGRATION_DATABASE_URL)
# Guía de despliegue: docs/runbooks/despliegue-api.md

# Base fijada por digest: la misma imagen en cada build, no "la última 22".
# Dependabot propone la actualización; se acepta a propósito, no por accidente.
# Va escrita en cada FROM (no en un ARG) para que Dependabot la reconozca.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
# Prisma detecta la versión de OpenSSL al instalar y al arrancar; la imagen
# slim no la trae.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN corepack enable
WORKDIR /app

# ── Compilación: dependencias completas, solo para producir dist/ ──
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@fedesoft/api

# ── Dependencias de producción: sin herramientas de desarrollo ──
FROM base AS prod
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/config/package.json packages/config/
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --prod --frozen-lockfile --filter "@fedesoft/api..." \
 && pnpm --filter @fedesoft/db exec prisma generate \
 && rm -rf /root/.cache /root/.local/share/pnpm
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# ── Ejecución ──
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
# Sin gestores de paquetes en la imagen final: el API no los usa y a quien
# entre le servirían para instalar lo que quisiera.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    PORT=3000 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
# El código es de root y solo legible para el proceso: quien comprometa el
# API no puede reescribirlo ni plantar módulos.
COPY --from=prod /app /app
COPY --chmod=0755 apps/api/docker/migrate /usr/local/bin/migrate
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# node como PID 1 recibe SIGTERM y Nest cierra ordenado (enableShutdownHooks).
CMD ["node", "apps/api/dist/main.js"]
