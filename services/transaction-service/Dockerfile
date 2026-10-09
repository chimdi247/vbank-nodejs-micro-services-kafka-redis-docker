# syntax=docker/dockerfile:1.7
# Build context is the repository root (see docker-compose.yml) because the
# service depends on the shared packages in ./packages.

# ---------- build stage ----------
FROM node:22-alpine AS builder

# native modules (e.g. bcrypt) fall back to a source build if no prebuilt binary matches
RUN apk add --no-cache python3 make g++

WORKDIR /workspace

# 1. shared packages (order matters: logger is a dependency of the others)
COPY packages ./packages
RUN set -e; for p in logger constants kafka-client redis-client; do \
      cd /workspace/packages/$p; \
      npm install --no-audit --no-fund; \
      npm run build; \
      npm prune --omit=dev --no-audit --no-fund; \
    done

# 2. service dependencies (cached until package.json changes)
WORKDIR /workspace/services/transaction-service
COPY services/transaction-service/package*.json ./
RUN npm install --no-audit --no-fund

# 3. compile
COPY services/transaction-service/tsconfig.json ./
COPY services/transaction-service/src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---------- runtime stage ----------
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/services/transaction-service/package*.json ./services/transaction-service/
COPY --from=builder /workspace/services/transaction-service/node_modules ./services/transaction-service/node_modules
COPY --from=builder /workspace/services/transaction-service/dist ./services/transaction-service/dist

WORKDIR /workspace/services/transaction-service
USER node
EXPOSE 3000

# OpenTelemetry auto-instrumentation is preloaded before the app code, so http, express,
# pg, ioredis, kafkajs and winston are instrumented without touching application code.
# All exporter settings come from the OTEL_* environment variables set in docker-compose.yml.
CMD ["node", "--require", "@opentelemetry/auto-instrumentations-node/register", "dist/app.js"]
