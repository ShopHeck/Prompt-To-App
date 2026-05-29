FROM node:24-slim AS base
RUN corepack enable pnpm
WORKDIR /app

# Copy workspace config and lockfile first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json tsconfig.base.json tsconfig.json ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/

RUN pnpm install --frozen-lockfile

# ── API server build ─────────────────────────────────────────────────────────
FROM base AS api-build
RUN pnpm --filter @workspace/api-server run build

# ── Frontend build ───────────────────────────────────────────────────────────
FROM base AS frontend-build
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @workspace/promptios run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:24-slim AS production
RUN corepack enable pnpm

# Security: run as non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/sh --create-home appuser

WORKDIR /app
COPY --from=api-build /app /app
COPY --from=frontend-build /app/artifacts/promptios/dist/public ./artifacts/api-server/public

# DB migration files needed at runtime
COPY lib/db/migrations/ lib/db/migrations/

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:${PORT:-8080}/api/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER appuser
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
