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

This starts PostgreSQL and the API server. The frontend can be run separately in dev mode or built and served statically.

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
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Override for proxies or compatible APIs |
| `PORT` | No | `8080` | API server port |
| `SESSION_SECRET` | No | — | Session cookie signing secret |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects/recent` | 5 most recent projects |
| `GET` | `/api/projects/stats` | Aggregate statistics |
| `GET` | `/api/projects/:id` | Get project details |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/projects/:id/files` | Get generated files |
| `POST` | `/api/projects/:id/generate` | SSE-stream code generation |
| `POST` | `/api/projects/:id/share` | Create a share link |
| `GET` | `/api/shared/:token` | View a shared project |
| `GET` | `/api/projects/:id/download` | Download as zip |
