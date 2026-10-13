# Changelog

All notable changes to PitchFire are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to completed phases.

---

## [Unreleased] — Phase 4: Intelligence & Polish

### Planned
- Analytics funnel dashboard: applied → reply → interview → offer
- `CoachAgent` — interview Q&A generator per company + role (Sonnet)
- Slack webhook notifications for key pipeline events
- `@bull-board/express` admin UI at `/admin/queues` (ADMIN_TOKEN gated)
- LinkedIn Jobs API (replace Playwright scraper)
- Indeed Publisher API (replace Cloudflare-blocked scraper)
- Score-gated critique loop: `while (score < 0.8 && round < 3)`

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
