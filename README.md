# promptiOS — Prompt to iOS App Generator

Convert natural language prompts into production-ready, App Store-shippable iOS projects.

## What it does

1. **Describe** your app idea in plain English
2. **Clarify** — AI asks follow-up questions if the prompt is ambiguous
3. **Architect** — Streams an architecture plan (screens, models, navigation, SPM deps)
4. **Approve** — Review and edit the plan before code generation
5. **Build** — Generates a multi-file Swift project with real-time SSE streaming
6. **Validate** — AI accuracy reviewer scores the output against the plan
7. **Repair** — Auto-fixes issues found by the validator
8. **Preview** — Live HTML mockup of the generated app
9. **Download** — Xcode-ready zip with `project.yml`, `Info.plist`, asset catalogs, and App Store submission guide

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24, TypeScript 5.9 |
| Frontend | React 19 + Vite (`artifacts/promptios`) |
| API | Express 5 (`artifacts/api-server`) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Validation | Zod, drizzle-zod |
| API codegen | OpenAPI → Orval → React Query hooks |
| AI | OpenAI (configurable base URL for proxies/compatible APIs) |
| Build | esbuild |

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm 10+
- PostgreSQL 16+

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and OPENAI_API_KEY

# Push database schema
pnpm --filter @workspace/db run push

# Start the API server (default: http://localhost:8080)
pnpm --filter @workspace/api-server run dev

# In another terminal — start the frontend (default: http://localhost:5173)
PORT=5173 BASE_PATH="/" pnpm --filter @workspace/promptios run dev
```

### Docker

```bash
# Requires OPENAI_API_KEY in your environment or .env file
docker compose up
```

This starts PostgreSQL, builds both the API server and React frontend, and serves everything on `http://localhost:8080`.

## Deployment

### Docker (recommended)

```bash
# Build production image (includes both API + frontend)
docker build --target production -t prompt-to-app .

# Run with your env vars
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  -e OPENAI_API_KEY=sk-... \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  prompt-to-app

# Run database migrations
DATABASE_URL=postgresql://... pnpm run migrate
```

### Railway

1. Connect your GitHub repo to [Railway](https://railway.app)
2. Railway auto-detects the `railway.toml` config
3. Add a PostgreSQL plugin for the database
4. Set environment variables in the Railway dashboard:
   - `DATABASE_URL` (auto-set by the PostgreSQL plugin)
   - `OPENAI_API_KEY`, `SESSION_SECRET`, plus any optional vars from `.env.example`
5. Deploy — Railway builds the Docker image and starts the service

### Fly.io

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
fly launch --no-deploy        # Creates the app
fly postgres create           # Creates managed Postgres
fly postgres attach           # Sets DATABASE_URL automatically
fly secrets set OPENAI_API_KEY=sk-... SESSION_SECRET=$(openssl rand -hex 32)
fly deploy                    # Builds and deploys
```

### GitHub Actions (CI/CD)

The repo includes two workflows:
- **CI** (`.github/workflows/ci.yml`) — runs on PRs: lint, typecheck, build, integration tests
- **Deploy** (`.github/workflows/deploy.yml`) — runs on merge to main: builds Docker image, pushes to GitHub Container Registry

To enable auto-deploy to Railway or Fly.io, uncomment the relevant job in `deploy.yml` and add the required secret (`RAILWAY_TOKEN` or `FLY_API_TOKEN`).

## Project Structure

```
├── artifacts/
│   ├── api-server/       # Express 5 API — generation engine, CRUD, sharing, download
│   ├── promptios/        # React frontend — dashboard, project detail, code viewer
│   └── mockup-sandbox/   # Component preview sandbox
├── lib/
│   ├── api-client-react/ # Generated React Query hooks (from OpenAPI spec)
│   ├── api-spec/         # OpenAPI 3.1 specification
│   ├── api-zod/          # Generated Zod validators (from OpenAPI spec)
│   ├── db/               # Drizzle ORM schema + migrations
│   ├── integrations-openai-ai-server/  # OpenAI client (server-side)
│   └── integrations-openai-ai-react/   # Voice/audio hooks (client-side)
├── scripts/              # Build & maintenance scripts
├── .env.example          # Environment variable reference
├── docker-compose.yml    # Docker development setup
└── Dockerfile            # Production container build
```

## Key Commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Typecheck + build all packages
pnpm run build

# Regenerate API hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Run E2E tests
pnpm --filter @workspace/promptios run test:e2e
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key (* at least one AI provider required) |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `ANTHROPIC_API_KEY` | No | — | Anthropic Claude API key |
| `SESSION_SECRET` | Prod | — | Cookie signing secret (`openssl rand -hex 32`) |
| `PORT` | No | `8080` | API server port |
| `ALLOWED_ORIGINS` | Prod | `*` | CORS origins (comma-separated) |
| `STRIPE_SECRET_KEY` | No | — | Stripe API key (enables billing) |
| `SENTRY_DSN` | No | — | Sentry error tracking DSN |
| `RELEASE_SHA` | No | `dev` | Git SHA for release tracking |

See [`.env.example`](.env.example) for the full list.

## API Endpoints

See the full [OpenAPI spec](lib/api-spec/openapi.yaml) for complete documentation (29 endpoints).

| Group | Method | Path | Description |
|-------|--------|------|-------------|
| Health | `GET` | `/api/healthz` | Liveness probe |
| Health | `GET` | `/api/readyz` | Readiness check (DB, metrics, memory) |
| Auth | `POST` | `/api/auth/register` | Create account |
| Auth | `POST` | `/api/auth/login` | Log in |
| Auth | `POST` | `/api/auth/logout` | Log out |
| Auth | `GET` | `/api/auth/me` | Current user + quota |
| Auth | `PUT` | `/api/auth/password` | Change password |
| Billing | `GET` | `/api/billing/plans` | Plan pricing |
| Billing | `POST` | `/api/billing/checkout` | Stripe checkout |
| Billing | `GET` | `/api/billing/subscription` | Current subscription |
| Billing | `POST` | `/api/billing/portal` | Stripe customer portal |
| Projects | `GET` | `/api/projects` | List all |
| Projects | `POST` | `/api/projects` | Create |
| Projects | `GET` | `/api/projects/:id` | Get details |
| Projects | `DELETE` | `/api/projects/:id` | Delete |
| Projects | `POST` | `/api/projects/:id/generate` | SSE-stream iOS generation |
| Projects | `POST` | `/api/projects/:id/generate-web` | SSE-stream web generation |
| Projects | `POST` | `/api/projects/:id/refine` | AI refinement (Pro/Studio) |
| Projects | `GET` | `/api/projects/:id/download` | Download as zip |
| Misc | `GET` | `/api/providers` | Available AI providers |
| Misc | `GET` | `/api/templates` | Prompt templates |
