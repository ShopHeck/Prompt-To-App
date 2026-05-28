FROM node:24-slim AS base
RUN corepack enable pnpm

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json tsconfig.base.json tsconfig.json ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/

RUN pnpm install --frozen-lockfile

# ── API server build ─────────────────────────────────────────────────────────
FROM base AS api-build
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS api
RUN corepack enable pnpm
WORKDIR /app
COPY --from=api-build /app /app
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
