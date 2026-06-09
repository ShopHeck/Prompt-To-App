FROM node:24-slim AS base
RUN corepack enable pnpm && corepack install -g pnpm@10.28.1
WORKDIR /app

# Copy workspace config and lockfile first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json tsconfig.base.json tsconfig.json ./

# Copy only package.json files from sub-packages (dependency manifest layer)
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/promptios/package.json artifacts/promptios/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY scripts/package.json scripts/

RUN pnpm install --frozen-lockfile

# Now copy source code (changes here don't bust the install cache)
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/

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
RUN corepack enable pnpm && corepack install -g pnpm@10.28.1

# Security: run as non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/sh --create-home appuser

WORKDIR /app
COPY --from=api-build /app /app
COPY --from=frontend-build /app/artifacts/promptios/dist/public ./artifacts/api-server/dist/public

# DB migration files needed at runtime
COPY lib/db/migrations/ lib/db/migrations/

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:${PORT:-8080}/api/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER appuser
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
