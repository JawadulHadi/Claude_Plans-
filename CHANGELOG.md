# Changelog

All notable changes to PitchFire are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to completed phases.

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

### Planned post-Phase 5
- LinkedIn Jobs API (replace Playwright scraper)
- Indeed Publisher API (replace Cloudflare-blocked scraper)
- White-label subdomain routing

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

### Migration required
- Run `supabase/migrations/002_voyage_embeddings.sql` — resizes `embedding` columns and IVFFlat indexes from 1536 → 1024 dims.

---

## [0.3.0] — 2025-10-13 — Phase 0: Rename to PitchFire

### Changed
- All `jobpilot-ai` / `@jobpilot/*` / `JobPilot` references replaced with `pitchfire` / `@pitchfire/*` / `PitchFire` across 39 files.
- All `Applymatic` documentation references replaced with `PitchFire` across 7 docs files.
- `pnpm-lock.yaml` regenerated with new `@pitchfire/*` scope.
- Persistent browser profile path: `~/.jobpilot/browser_profiles/` → `~/.pitchfire/browser_profiles/`.

---

## [0.2.0] — 2025-10-12 — Phase 2: Apply Automation

### Added
- **`ApplierAgent`** — Playwright form-filler with Claude-guided DOM analysis. Persistent browser profiles at `~/.pitchfire/browser_profiles/`.
- **ATS playbooks** — `knowledge/skills/ats_playbooks/`: `workday.md`, `greenhouse.md`, `lever.md`.
- **Apply API** — `GET /apply/pending/:userId`, `POST /apply/:applicationId` (approve / withdraw). Enqueues BullMQ `apply` job on approval.
- **Review UI** — `/review` page: approval queue with tailored resume + cover letter preview, one-click approve or withdraw.
- **Pipeline tracker** — `packages/pipeline-tracker/src/supabase.ts` (status transitions) + `notion.ts` (stub sync).
- **Pipeline status machine** — `pending → tailoring → awaiting_approval → applying → applied / failed`.

### Deliverable
Full pipeline: scout → score → tailor → review (user approval gate) → apply → track.

---

## [0.1.0] — 2025-10-12 — Phase 1: Foundation

### Added
- **Monorepo** — pnpm workspaces, turbo.json, `@pitchfire/*` package scope.
- **NestJS API** (`apps/api`) — modules: `resume`, `jobs`, `agents`, `pipeline`. Swagger at `/api`.
- **Next.js 14 dashboard** (`apps/web`) — App Router, Tailwind + shadcn/ui. Routes: `/`, `/jobs`, `/applications`, `/sessions`.
- **Agent worker** (`apps/agent`) — BullMQ consumer, concurrency 4, exponential backoff.
- **Agent stubs** — `scout.agent.ts`, `scorer.agent.ts`, `tailor.agent.ts`, `inbox.agent.ts`.
- **`resume-engine`** package — PDF/text parser (`pdf-parse`), Haiku embedder (1536-dim stub), Haiku scorer, Sonnet tailor + 2-round critique loop. Faithfulness self-eval: retry up to 3× if parse fails. Integrity check: post-tailor verification that no fabricated employers were introduced.
- **`job-scraper`** package — Playwright stealth browser, RemoteOK JSON scraper, Wellfound Playwright scraper.
- **`shared`** package — Zod schemas for all domain types + `AgentJob` discriminated union.
- **Supabase schema** — `supabase/migrations/001_init.sql`: `users`, `resumes`, `job_listings`, `applications`, `pipeline_events`, `sessions` tables with pgvector + IVFFlat index.
- **Docker Compose** — Supabase local stack + Redis.
- **Complexity router** — Haiku for filter/score (cheap), Sonnet for tailor/apply (quality-critical).

### Deliverable
Upload a PDF resume → see ranked job feed with match scores (0–1 cosine similarity via pgvector).

---

## Links
- [GitHub Releases](https://github.com/JawadulHadi/pitchfire/releases)
- [PROGRESS.md](docs/PROGRESS.md) — detailed phase reports with commit SHAs
- [R&D Findings](docs/RND.md)
