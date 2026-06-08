# Prompt-To-App: End-to-End Production Audit & Upgrade Plan

## Executive Summary

Prompt-To-App is a well-structured pnpm monorepo that converts natural language prompts into production-ready iOS (SwiftUI/UIKit) and web (React) projects via multi-provider AI. The architecture is sound - proper separation of concerns, typed contracts, streaming SSE, multi-model AI with fallback - but has several gaps that prevent production-readiness. This document identifies those gaps, proposes fixes, and identifies features worth porting from the sibling repos (App-generator-codex, RORK-Max-gemma3) before archiving them.

---

## Part 1: Security Audit

### 1.1 CRITICAL: No Authorization Checks on Project CRUD

**Finding:** All project endpoints (`GET /projects`, `POST /projects`, `DELETE /projects/:id`) have NO ownership verification. Any user (or unauthenticated visitor) can list, view, modify, or delete any project in the system.

**Evidence:**
- `routes/projects.ts` line ~68: `GET /projects` returns ALL projects with no `userId` filter
- `DELETE /projects/:id` has no check that `req.user?.id === project.userId`
- Share tokens expose full project + files to anyone with the token (intentional, but unscoped)

**Impact:** Complete data breach - any authenticated user can enumerate and steal all other users' generated code.

**Fix:** Add `requireAuth` middleware + `userId` WHERE clause on all project queries. Admin-only endpoints for global listing.

### 1.2 HIGH: In-Memory Rate Limiting Does Not Scale

**Finding:** `rate-limit.ts` uses an in-memory `Map<string, number[]>` for tracking request counts. This:
- Resets on every deployment/restart
- Does not work across multiple instances (Fly.io `min_machines_running = 1` currently, but scaling will break it)
- Accumulates memory indefinitely (cleanup interval only runs every 5 minutes)

**Fix:** Replace with Redis-backed rate limiter (e.g., `@upstash/ratelimit` or `ioredis` + sliding window) or at minimum use Fly.io's built-in connection limiting.

### 1.3 HIGH: CORS Configuration Allows All Origins When ALLOWED_ORIGINS is Empty

**Finding:** In `security.ts`:
```typescript
if (ALLOWED_ORIGINS.length === 0) {
  callback(null, true); // Allows ANY origin in production!
  return;
}
```
If a production deployment forgets to set `ALLOWED_ORIGINS`, it silently allows all cross-origin requests.

**Fix:** Default to rejecting unknown origins in production when `ALLOWED_ORIGINS` is empty. Log a warning on startup.

### 1.4 HIGH: Quota Increment Bug - Drizzle SET Followed by Raw SQL

**Finding:** In `quota.ts` `incrementUsage()`:
```typescript
await db.update(usersTable).set({ monthlyGenerations: usersTable.monthlyGenerations })...
// Then does raw SQL: monthly_generations = monthly_generations + 1
```
The first Drizzle update sets `monthlyGenerations` to its own value (no-op), then a second raw query does the actual increment. This is a race condition and the Drizzle call is dead code.

**Fix:** Remove the dead Drizzle update, use only the atomic SQL increment (or Drizzle's `sql` operator for atomic increment).

### 1.5 MEDIUM: Session Tokens Not Bound to User-Agent/IP

Sessions last 30 days with no rotation or binding to client fingerprint. A stolen session cookie works from any device/IP indefinitely.

**Fix:** Add session metadata (user-agent hash, IP prefix) and support session revocation from settings.

### 1.6 MEDIUM: No Input Size Limits on Generation Prompts

The `/generate` endpoint accepts arbitrarily long prompts that get forwarded to the AI provider. A malicious user could send a 1MB prompt, generating large AI bills.

**Fix:** Add `maxTokens` estimation or character limit on prompt input (e.g., 10,000 chars).

### 1.7 MEDIUM: Webhook Signature Replay Not Prevented

The Stripe webhook signature check verifies HMAC correctness but does not check the timestamp tolerance window (`t` parameter). An attacker who intercepts a valid webhook payload could replay it indefinitely.

**Fix:** Add timestamp tolerance check (reject if `abs(now - t) > 300s`).

### 1.8 LOW: CSP Allows unsafe-inline for Styles

Production CSP includes `'unsafe-inline'` for `styleSrc`, weakening XSS protections for CSS injection attacks.

### 1.9 LOW: No Account Lockout After Failed Login Attempts

The `authLimiter` limits to 10 attempts per 15 minutes by IP, but a distributed attack from many IPs can still brute-force passwords. No per-account lockout exists.

---

## Part 2: Architecture Audit

### 2.1 Missing Authorization Layer

There is no middleware or utility for checking resource ownership. Every route handler would need to independently query + check, leading to inconsistencies.

**Recommendation:** Create a `requireOwnership(resource)` middleware pattern that DRYs this up.

### 2.2 Monolithic Route File (`projects.ts` is 1,144 lines)

The generation logic (planning, building, validation, repair, preview) is embedded directly in route handlers. This makes unit testing nearly impossible and creates coupling between HTTP concerns and business logic.

**Recommendation:** Extract generation pipeline into a service layer (`services/generation-service.ts`) with the route handler as a thin adapter.

### 2.3 No Job Queue for Long-Running Generation

AI generation takes 30-120+ seconds. Currently this runs inside the HTTP request handler with SSE. If the client disconnects or the server restarts mid-generation, the project is stuck in "generating" status forever (there's a 5-minute stale check, but it only fires on the next request).

**Recommendation:** Port the pipeline pattern from App-generator-codex: decouple generation into a job queue (BullMQ/Redis or Postgres-based) with status tracking, allowing recovery from crashes.

### 2.4 No Multi-Tenancy Infrastructure

Current model is single-user-per-project with a simple `userId` FK. There's no workspace/team concept.

**From App-generator-codex:** The tenant model with `tenants` table, `plan_tiers`, per-tenant usage limits, and owner/admin/member roles is a mature pattern worth porting.

### 2.5 No Revision/Audit Trail for Generated Code

When a project is regenerated or refined, old files are overwritten with no history. There's no way to diff changes or roll back.

**From App-generator-codex:** The `spec-revision-repository` and `RevisionStore` pattern tracks every mutation to project artifacts with timestamps, types, and messages.

### 2.6 Database Schema Design Issues

- `architecturePlan`, `accuracyReport`, `repairHistory`, `qualityReport`, `livePreviewHtml` are all stored as `TEXT` (stringified JSON) in the `projects` table. No indexing, no querying, no validation at DB level.
- No foreign key from `projects.userId` to `users.id` ON DELETE CASCADE defined in the Drizzle schema (only in migration SQL).
- No indexes on commonly queried fields (project `status`, `userId`).

### 2.7 The `middlewares/` Directory is Empty

There are two directories: `middleware/` (populated) and `middlewares/` (empty). Dead directory should be removed.

---

## Part 3: Code Quality Audit

### 3.1 Type Safety Gaps

- `projects.ts` uses `as` type casts on Zod-parsed bodies instead of inferring types
- AI response parsing uses `as` casts without runtime validation
- `req.body as { ... }` pattern in several routes bypasses the Zod validation benefit

### 3.2 Error Handling Inconsistencies

- Some routes use `try/catch` with generic 500s
- SSE endpoints swallow errors differently (some send error event + end, others leave connection open)
- No standardized error response shape across all endpoints

### 3.3 Dead Code

- `quota.ts` has the dead Drizzle update before the raw SQL increment
- The `middlewares/` empty directory
- `import crypto from "node:crypto"` in `projects.ts` (uses `crypto.randomUUID()` from global, not the import)

### 3.4 Test Coverage Gaps

- **Good:** 220+ lines of integration tests covering auth, billing, projects, share, refinement
- **Missing:** No tests for the actual generation pipeline (mocked AI calls)
- **Missing:** No tests for the quota system's month-reset logic
- **Missing:** No tests for rate limiting behavior
- **Missing:** No tests for CSRF protection
- **Missing:** No frontend unit tests (only Playwright E2E which requires a running LLM)

### 3.5 Hardcoded Model Names

`ai-client.ts` hardcodes model names like `gpt-5.4`, `claude-opus-4-7`. When models are deprecated or new versions ship, a code deploy is required.

**Fix:** Move to env-configurable model selection with sensible defaults.

---

## Part 4: Testing Audit

### 4.1 Test Infrastructure is Solid

- Vitest with proper Postgres test setup/teardown
- Each test gets a clean DB state (DELETE + sequence reset)
- Supertest for HTTP-level integration testing
- Playwright for real E2E flows

### 4.2 What's Missing

| Area | Current Coverage | Gap |
|------|-----------------|-----|
| Auth flows | Excellent | - |
| Project CRUD | Excellent | No ownership tests (because no ownership exists) |
| Billing | Good (edge cases) | No successful payment flow test |
| Generation | Zero | Need mocked AI for pipeline testing |
| Quota | Zero | Month-reset logic untested |
| Rate limit | Zero | Behavior under load untested |
| Web generation | Minimal | Only error cases tested |
| Frontend components | Zero | No component tests |
| Accessibility | Zero | No a11y testing |

### 4.3 E2E Tests Require Live LLM

Playwright tests call real AI APIs (`test.setTimeout(8 * 60_000)`). This means:
- CI needs API keys set as secrets
- Tests are slow (up to 8 minutes each)
- Tests are non-deterministic (AI responses vary)
- Tests can fail due to provider outages

**Fix:** Add a mock/replay layer for E2E tests that records real API responses once and replays them.

---

## Part 5: Deployment & Operations Audit

### 5.1 Good Foundation

- Multi-stage Dockerfile with non-root user
- Health check endpoints (`/healthz` and `/readyz` with DB check)
- Fly.io + Railway configs with auto-scaling
- Sentry integration for error tracking
- Pino structured logging with sensitive field redaction
- Docker Compose for local development

### 5.2 Missing for Production

| Concern | Status |
|---------|--------|
| Database backups | Not configured (relies on provider) |
| Database connection pooling | Using pg.Pool with defaults |
| Graceful shutdown | Missing (no SIGTERM handler to drain connections) |
| Zero-downtime migrations | No tooling (raw SQL files) |
| Secrets rotation | No strategy |
| Rate limit persistence | In-memory (lost on restart) |
| CDN/edge caching | No Cache-Control on static assets beyond the frontend bundle |
| APM/tracing | Sentry traces at 10% sample rate, no distributed tracing |
| Alerting | No configured alerts (relies on Sentry default rules) |
| Horizontal scaling | Blocked by in-memory rate limiting |
| Database indexes | Missing on hot paths |
| Connection leak detection | None |

### 5.3 Dockerfile Issues

- Copies entire `lib/` and `artifacts/` before install, busting layer cache on any code change
- No `.dockerignore` found (copies `node_modules`, `.git`, etc.)
- Production image includes all dev dependencies from the install step

---

## Part 6: Performance Audit

### 6.1 N+1 Queries

- `/projects/:id/download` fetches project then fetches all files in a second query (acceptable for single project)
- `GET /projects` returns ALL projects with no pagination
- Stats endpoint runs 4 separate COUNT queries that could be a single query

### 6.2 No Pagination

`GET /projects` returns every project in the system. At scale this will OOM the server and timeout the client.

### 6.3 Memory Usage

- Metrics middleware keeps last 1,000 response times in memory (bounded, acceptable)
- Rate limiter keeps all IPs + timestamps indefinitely between 5-min cleanup cycles
- Generated zip files are assembled entirely in memory before streaming to client
- `livePreviewHtml` can be very large (full HTML page stored in TEXT column, loaded into memory on every project query)

### 6.4 SSE Connection Management

No heartbeat/keepalive on SSE connections. Proxy servers (Cloudflare, Fly.io) may close idle connections during long AI calls. No client reconnection protocol.

---

## Part 7: Observability Audit

### 7.1 Good

- Structured JSON logging (Pino) with request IDs
- Response time tracking (p50, p95)
- Error rate tracking
- Sentry exception capture with context
- Memory usage in readiness check
- Sensitive field redaction in logs

### 7.2 Missing

- No request tracing across the AI pipeline stages
- No AI token usage tracking/logging (cost visibility)
- No per-user/per-plan usage dashboards
- No generation success/failure rate metrics
- No alert thresholds (error rate spikes, memory pressure, DB connection pool exhaustion)
- No audit log for security-sensitive operations (login, password change, billing changes)

---

## Part 8: Features to Port from Sibling Repos

### 8.1 From App-generator-codex (HIGH VALUE)

| Feature | What It Provides | Porting Effort |
|---------|-----------------|----------------|
| **Pluggable Generator Registry** | Clean abstraction for adding new generation targets (iOS, web, Android, etc.) | Medium - refactor current generation into BaseGenerator + registry |
| **Spec Revision Repository** | Full audit trail of every generation/refinement with diffing capability | Medium - new DB table + service |
| **Multi-Tenant System** | Teams/workspaces with role-based access, plan-scoped limits | High - new schema, middleware, migration |
| **Generation Pipeline Class** | Decoupled, testable pipeline with dependency injection | Medium - extract from monolithic route handler |
| **Plan Limit Service** | Separate generation + export quotas per tenant with current-month tracking | Low - extend existing quota system |
| **Generation Run Repository** | Tracks every generation attempt (success/fail) with metadata for analytics | Low - new table + inserts |

### 8.2 From RORK-Max-gemma3 (MEDIUM VALUE)

| Feature | What It Provides | Porting Effort |
|---------|-----------------|----------------|
| **Visual Feedback Loop** | User uploads screenshot, AI analyzes and fixes UI issues | Medium - new endpoint + Gemini vision API integration |
| **Local macOS Bridge Concept** | Syncs generated code to local Xcode/Simulator for real-time preview | High - requires native app or CLI tool |
| **Style Presets / "Vibes"** | Toggle between design styles (Cyberpunk, Minimalist, etc.) applied to generation prompts | Low - extend prompt template system |
| **Gemini Image Generation** | AI-generated app icons using Gemini's image model | Low - already have multi-provider client |
| **Monaco Code Editor** | In-browser code editing of generated files before download | Medium - add to frontend |

### 8.3 Recommended Port Priority

1. **Spec Revision Repository** - immediate value, prevents data loss on regeneration
2. **Pluggable Generator Registry** - cleaner architecture for iOS + web + future targets
3. **Generation Pipeline Class** - testability and crash recovery
4. **Visual Feedback Loop** - killer differentiator feature
5. **Style Presets** - low-effort user delight
6. **AI-generated Icons** - low effort, high perceived value
7. **Multi-Tenant System** - when team features are needed

---

## Part 9: Prioritized Upgrade Plan

### P0 - Security Fixes (MUST DO before any production traffic)

1. Add project ownership enforcement (filter by userId, check on mutations)
2. Fix CORS to reject all origins in production when ALLOWED_ORIGINS is empty
3. Fix quota increment bug (remove dead Drizzle update)
4. Add Stripe webhook timestamp tolerance check
5. Add prompt size limits on generation endpoints
6. Add graceful shutdown handler (SIGTERM -> drain connections -> exit)

### P1 - Production Readiness (needed for stable operation)

7. Add pagination to project list endpoints
8. Add database indexes on hot paths (projects.user_id, projects.status, sessions.expires_at)
9. Replace in-memory rate limiter with persistent store (Redis or Postgres-based)
10. Add SSE heartbeat/keepalive for long-running generation
11. Add `.dockerignore` to optimize Docker builds
12. Fix Dockerfile layer caching (separate dependency install from code copy)
13. Add graceful DB connection handling (pool limits, timeout, release)
14. Add configurable model names via environment variables
15. Remove empty `middlewares/` directory

### P2 - Architecture Improvements (quality of life)

16. Extract generation logic from route handlers into service layer
17. Port Spec Revision Repository from App-generator-codex (audit trail for generations)
18. Port Pluggable Generator Registry pattern (base class + registry)
19. Add mocked AI layer for deterministic testing
20. Add unit tests for quota month-reset, rate limiting, CSRF
21. Add generation success/failure metrics + AI token cost tracking
22. Add audit logging for security-sensitive operations

### P3 - Feature Ports (differentiation)

23. Port Visual Feedback Loop (screenshot -> AI analysis -> code fix)
24. Port Style Presets / Vibes system
25. Port AI-generated App Icons (Gemini image model)
26. Add Monaco code editor for in-browser file editing
27. Port Generation Pipeline with job queue for crash recovery
28. Port Multi-Tenant system (when team features needed)

### P4 - Polish (nice to have)

29. Add SSE reconnection protocol (event IDs + client replay)
30. Add CDN cache headers for generated preview pages
31. Add database backup automation scripts
32. Add frontend component tests (Vitest + Testing Library)
33. Add accessibility testing (axe-core in Playwright)
34. Add distributed tracing across AI pipeline stages

---

## Part 10: Archiving Strategy for Sibling Repos

### App-generator-codex
- **Extract:** Generator registry pattern, spec revision repository, generation pipeline, tenant routes, plan limit service
- **Archive:** Set repo to read-only/archived on GitHub after extraction
- **Note:** The rule-based intent parsing (`prompt-intake.js`, `spec-generator.js`) is superseded by Prompt-To-App's LLM-based approach

### RORK-Max-gemma3
- **Extract:** Visual feedback loop concept (screenshot analysis), Gemini service patterns, style preset system
- **Archive:** This is essentially a prototype/demo - no production patterns worth keeping beyond the concepts listed
- **Note:** The bridge.js local sync concept is interesting but requires a native macOS companion app - defer unless user demand exists

---

## Appendix A: Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data breach via missing auth | High | Critical | P0 fix #1 |
| User exhausts AI budget via large prompts | Medium | High | P0 fix #5 |
| Server crash during generation loses state | Medium | Medium | P2 fix #27 |
| Rate limit reset on deploy allows abuse burst | Medium | Medium | P1 fix #9 |
| Stale generation status blocks user forever | Low | Medium | Already has 5-min stale check |
| LLM provider outage blocks all generation | Medium | High | Already has multi-provider fallback |
| Database grows unbounded (no cleanup) | High | Medium | Add retention policy |

## Appendix B: Quick Wins (< 1 hour each)

1. Remove empty `middlewares/` directory
2. Add `.dockerignore` file
3. Add `SIGTERM` graceful shutdown in `index.ts`
4. Fix quota increment dead code
5. Add `max_length` to prompt Zod schemas
6. Add database indexes via migration
7. Add SSE comment heartbeat every 15s in generation endpoints
8. Make model names configurable via env vars with current values as defaults
