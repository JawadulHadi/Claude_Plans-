# Changelog

All notable changes to PitchFire are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to completed phases.

---

## [0.7.0] — 2026-10-14 — Agent Communication + Market-Standard Polish

### Added
- **`apps/agent/src/lib/logger.ts`** — Zero-dependency structured JSON logger. `createLogger(agentName)` returns `{ info, warn, error, debug }` methods. Errors/warns go to stderr; info/debug to stdout. All 7 agents now emit machine-readable JSON log lines with `{ ts, level, agent, msg, ...data }` — ready for log aggregation (Datadog, CloudWatch, etc.).
- **`apps/agent/src/lib/models.ts`** — Centralised model constants `MODELS.FAST = 'claude-haiku-5-5'` and `MODELS.QUALITY = 'claude-sonnet-4-6'`. `callWithRetry<T>(fn, { maxAttempts, agentName })` wraps any Claude API call with exponential backoff on HTTP 429/500/529 (2s → 4s → 8s). `logTokens(agent, model, usage, operation)` logs input/output/total tokens per call for SaaS cost visibility.
- **`apps/agent/src/lib/agent-bus.ts`** — BullMQ Queue producer module implementing the full 6-step agent communication chain. Lazy singleton IORedis connection (prevents connection-per-call leak). `closeAgentBus()` for graceful shutdown.
  - `publishScore(userId, resumeId)` → `discovery-queue` (ScoutAgent → ScorerAgent)
  - `publishTailor(applicationId)` → `apply-queue` (ScorerAgent → TailorAgent)
  - `publishApply(applicationId)` → `apply-queue` (API layer → ApplierAgent after user approval)
  - `publishInbox(userId)` → `comms-queue` with 5-min delay (ApplierAgent → InboxAgent)
  - `publishSchedule(applicationId, threadId)` → `comms-queue` (InboxAgent → SchedulerAgent)
  - `publishCoach(sessionId)` → `comms-queue` (SchedulerAgent → CoachAgent)

### Changed
- **ScoutAgent**: Replaced `console.log` with structured logger. After `stored > 0`, fetches the user's most recent resume and publishes a `score` job (was TODO comment). Added `score_triggered` to output.
- **ScorerAgent**: Replaced `console.error/log` with structured logger. Added `callWithRetry`. Replaced magic `0.72` literal with named constant `MATCH_THRESHOLD`. Replaced `console.log` tailor-queue comment with actual `publishTailor(app.id)` call.
- **TailorAgent**: Replaced `console.log/warn` with structured logger. Added explicit comment explaining that downstream `publishApply` is intentionally absent — the `/review` UI is the approval gate.
- **ApplierAgent**: Replaced `console.log/error` with structured logger. Added `callWithRetry` + `MODELS.QUALITY`. Replaced `console.log` inbox-trigger comment with actual `publishInbox(userId)` call.
- **InboxAgent**: Replaced `console.warn` with structured logger. Added `logTokens` per Claude round. Threaded `thread_id` through `handleClassification()` so `interview_invite` events now call `publishSchedule(applicationId, threadId)`.
- **SchedulerAgent**: Replaced all `console.log/error` with structured logger. Added `callWithRetry` + `logTokens`. After session insert, now calls `publishCoach(session.id)`.
- **CoachAgent**: Replaced `console.log/error` with structured logger. Added `callWithRetry` + `logTokens`. CoachAgent is the final node — no downstream publish.
- **worker.ts**: Replaced all `console.log/error` with structured logger. Collects workers in array for graceful drain. SIGTERM handler now awaits `closeAgentBus()` alongside worker close and Redis disconnect.

### Fixed
- **ScorerAgent** — `.not('id', 'in', '(null)')` bug: when a user has zero existing applications, the previous filter `.not('id', 'in', '(null)')` caused Supabase to match **zero** job rows. Fixed by skipping the `.not()` filter entirely when `existingJobIds.length === 0`.
- **ApplierAgent** — Hardcoded PII: `email: process.env.USER_EMAIL ?? 'jawadulhadicc@gmail.com'` was a privacy/security violation in a multi-tenant SaaS context. Fixed: fetch `email` from `users` table via Supabase; fail fast with structured error if no email is found. Other profile fields (firstName, lastName, phone, location) use env vars with empty-string defaults.

---

## [0.6.0] — 2026-10-13 — Phase 5: SaaS Layer

### Added
- **Stripe billing module** — `apps/api/src/modules/billing/`. `BillingService` handles Checkout sessions (pro/agency), Customer Portal, and webhook events (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`). Downgrades to free on payment failure. `enforceLimit()` guard used before any application submit.
- **Plan enforcement** — `BillingService.enforceLimit(userId)` checks `users.applications_this_month` against `PLAN_LIMITS` (`free: 10/mo, pro: unlimited, agency: unlimited`). Returns 403 with upgrade prompt when limit reached.
- **Agency tenants module** — `apps/api/src/modules/tenants/`. `TenantsService` manages `agency_members` table: `listMembers`, `addMember` (by email, slot limit 10), `updateMember`, `removeMember`. `getBulkApplyStatus` returns per-member funnel stats. All operations require `plan = 'agency'`.
- **Marketing landing page** — `apps/web/src/app/(marketing)/page.tsx`. Hero + metrics (83% latency drop, 99.9% uptime, 10+ boards), 6-feature grid, 3-tier pricing cards, case study CTA. Standalone layout (no inner nav frame).
- **Billing UI** — `apps/web/src/app/billing/page.tsx`. Current plan card with usage progress bar (colour-coded: blue → amber → red), upgrade cards, Stripe Customer Portal button.
- **Agency dashboard** — `apps/web/src/app/agency/page.tsx`. Add member by email + label, active roster table with per-profile funnel stats (applied / replied / interviews), deactivate button.
- **DB migration `004_phase5_saas.sql`** — `stripe_subscription_id`, `plan_period_start/end` columns on `users`; `agency_members` table (RLS: agency owner only); `usage_events` table; performance indexes for plan enforcement.
- **`stripe` npm package** — `^17.7.0` added to `apps/api/package.json`.
- **`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** env vars added to `.env.example`.
- **Billing nav link** — added to `apps/web/src/app/layout.tsx`.

### Fixed (post-phase hotfix, same release)
- **Billing period reset** — `handleSubscriptionChange` now always resets `applications_this_month = 0` on any Stripe subscription update (was free-plan-only, leaving paid users' counters stale across billing periods). DB trigger `trg_reset_applications_on_period` in `005_billing_period_reset.sql` provides a second safety layer at the database level.

---

## [0.5.0] — 2025-10-13 — Phase 4: Intelligence & Polish

---

## [0.4.0] — 2025-10-13 — Phase 3: Communication Layer

### Added
- **`voyage-3-lite` embedder** — replaced deterministic sin/cos stub with Voyage AI 1024-dim dense vectors. pgvector similarity scores are now semantically valid.
- **`InboxAgent`** — full Gmail tool-use loop (5-round max). Claude drives `gmail_search_threads → gmail_get_thread` calls; Haiku classifies each thread as `interview_invite | rejection | offer | followup | other`. Fuzzy domain matching against `job_listings.company`. Auto-updates `applications.status` and writes `pipeline_events`.
- **`SchedulerAgent`** — new agent. Haiku extracts `{ interview_date, duration_minutes, location, confidence }`. Confidence gate: `< 0.8` → flags for user, no auto-book. Sonnet generates personalised prep notes. Google Calendar REST API creates event. Writes `sessions` row.
- **3-queue BullMQ worker** — split single `agent-jobs` queue into: `discovery-queue` (c=6), `apply-queue` (c=2), `comms-queue` (c=4).
- **Dead Letter Queue** — on 3rd job failure, raw payload pushed to `pitchfire:dlq` Redis list.
- **Sessions API** — `GET /sessions/:userId`, `GET /sessions/detail/:id`, `PATCH /sessions/:id`.
- **Queue router** — `enqueueAgentJob()` in `apps/api/src/common/queue.ts` routes by job type to correct queue.
- **`VOYAGE_API_KEY`, `GMAIL_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN`** env vars to `.env.example`.
- **`docs/RND.md`** — standalone R&D findings report.
- **SIGTERM drain** — graceful worker shutdown.

### Fixed
- `navigator.plugins` integer array `[1,2,3,4,5]` (known bot signature) → 3 real Chrome `Plugin` objects.

---

## [0.3.0] — 2025-10-13 — Phase 0: Rename to PitchFire

### Changed
- All `jobpilot-ai` / `@jobpilot/*` / `JobPilot` references replaced with `pitchfire` / `@pitchfire/*` / `PitchFire` across 39 files.

---

## [0.2.0] — 2025-10-12 — Phase 2: Apply Automation

### Added
- **`ApplierAgent`** — Playwright form-filler with Claude-guided DOM analysis. Persistent browser profiles at `~/.pitchfire/browser_profiles/`.
- **ATS playbooks** — `knowledge/skills/ats_playbooks/`: `workday.md`, `greenhouse.md`, `lever.md`.
- **Apply API** — `GET /apply/pending/:userId`, `POST /apply/:applicationId` (approve / withdraw). Enqueues BullMQ `apply` job on approval.
- **Review UI** — `/review` page: approval queue with tailored resume + cover letter preview, one-click approve or withdraw.
- **Pipeline tracker** — `packages/pipeline-tracker/src/supabase.ts` (status transitions) + `notion.ts` (stub sync).
- **Pipeline status machine** — `pending → tailoring → awaiting_approval → applying → applied / failed`.

---

## [0.1.0] — 2025-10-12 — Phase 1: Foundation

### Added
- **Monorepo** — pnpm workspaces, turbo.json, `@pitchfire/*` package scope.
- **NestJS API** (`apps/api`) — modules: `resume`, `jobs`, `agents`, `pipeline`. Swagger at `/docs`.
- **Next.js 14 dashboard** (`apps/web`) — App Router, Tailwind + shadcn/ui. Routes: `/`, `/jobs`, `/applications`, `/sessions`.
- **Agent worker** (`apps/agent`) — BullMQ consumer, concurrency 4, exponential backoff.
- **`resume-engine`** package — PDF/text parser, Haiku embedder, Haiku scorer, Sonnet tailor + 2-round critique loop.
- **`job-scraper`** package — Playwright stealth browser, RemoteOK JSON scraper, Wellfound Playwright scraper.
- **`shared`** package — Zod schemas for all domain types + `AgentJob` discriminated union.
- **Supabase schema** — `supabase/migrations/001_init.sql`: full schema with pgvector + IVFFlat index.
- **Docker Compose** — Supabase local stack + Redis.

---

## Links
- [GitHub Releases](https://github.com/JawadulHadi/pitchfire/releases)
- [PROGRESS.md](docs/PROGRESS.md) — detailed phase reports with commit SHAs
- [R&D Findings](docs/RND.md)
