# PitchFire — Project Progress & Implementation Report

> Single source of truth for all phases, PRs, decisions, and R&D findings.
> Updated after every merged PR. References are permanent links.

---

## Project Overview

**PitchFire** — Autonomous AI job search orchestrator. Multi-agent Claude platform that discovers jobs, scores them against your resume via RAG, tailors application variants, submits autonomously via Playwright, and manages the full pipeline (email, calendar, Notion).

**Repo:** `https://github.com/JawadulHadi/pitchfire`  
**Stack:** NestJS · Next.js 14 · Claude SDK (Sonnet 4.6 / Haiku 5.5) · BullMQ · Supabase (pgvector) · Playwright · pnpm workspaces

---

## Phase Status

| Phase | Name | Status | PR | Branch |
|---|---|---|---|---|
| 0 | Repo + Name | ✅ Done | [#4][pr4] | `feature/rename-to-pitchfire` |
| 1 | Foundation — Scout + Score + Dashboard | ✅ Done | [#1][pr1] | `feature/phase-1-foundation` |
| 2 | Apply Automation | ✅ Done | [#3][pr3] | `feature/phase-2-apply-automation` |
| 3 | Communication Layer | ✅ Done | [#6][pr6] | `feature/phase-3-communication-layer` |
| 4 | Intelligence & Polish | 🔲 Next | — | `feature/phase-4-intelligence` |
| 5 | SaaS Layer | 🔲 Queued | — | `feature/phase-5-saas` |

[pr1]: https://github.com/JawadulHadi/pitchfire/pull/1
[pr3]: https://github.com/JawadulHadi/pitchfire/pull/3
[pr4]: https://github.com/JawadulHadi/pitchfire/pull/4
[pr6]: https://github.com/JawadulHadi/pitchfire/pull/6

---

## Phase 1 — Foundation (✅ Merged · PR #1)

**Commit:** `a2b0685` · **Date:** 2026-10-12

### What Was Built

| Area | Files |
|---|---|
| Monorepo root | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example` |
| NestJS API | `apps/api/src/` — `app.module.ts`, `main.ts` (Swagger), modules: `resume`, `jobs`, `agents`, `pipeline` |
| Next.js web | `apps/web/src/app/` — layout, home, `/jobs`, `/applications`, `/sessions` |
| Agent worker | `apps/agent/src/worker.ts` — BullMQ consumer (concurrency 4, exponential backoff) |
| Agent stubs | `scout.agent.ts`, `scorer.agent.ts`, `tailor.agent.ts`, `inbox.agent.ts` |
| resume-engine | `packages/resume-engine/src/` — PDF/text parser, Haiku embedder (1536-dim), Haiku scorer, Sonnet tailor + critique loop |
| job-scraper | `packages/job-scraper/src/` — Playwright stealth browser, RemoteOK JSON scraper, Wellfound Playwright scraper |
| shared | `packages/shared/src/` — Zod schemas for all domain types + `AgentJob` discriminated union |
| DB | `supabase/migrations/001_init.sql` — full schema with pgvector, ivfflat index |
| Infra | `docker-compose.yml` — Supabase local + Redis |

### Key Patterns Applied
- **Conveyor belt parallelism** — scout + score + inbox run concurrently via `Promise.allSettled`
- **LoopAgent critique/revise** — up to 2 revision rounds on resume variants
- **Faithfulness self-eval** — retry up to 3× on resume scoring if parse fails
- **Integrity check** — post-tailor verification that no fabricated employers/roles were introduced
- **Complexity router** — Haiku for filter/score (cheap), Sonnet for tailor/apply (quality-critical)

### Deliverable
Upload a PDF resume → see ranked job feed with match scores (0–1 cosine similarity via pgvector).

---

## Phase 2 — Apply Automation (✅ Merged · PR #3)

**Commit:** `54ef593` · **Date:** 2026-10-12

### What Was Built

| Area | Files |
|---|---|
| ApplierAgent | `apps/agent/src/agents/applier.agent.ts` — Playwright form-filler; Claude-guided DOM analysis; persistent browser profiles at `~/.pitchfire/browser_profiles/` |
| ATS playbooks | `apps/agent/knowledge/skills/ats_playbooks/` — `workday.md`, `greenhouse.md`, `lever.md` |
| Apply module | `apps/api/src/modules/apply/` — `apply.service.ts` (GET pending, POST approve/withdraw); enqueues BullMQ `apply` job on approval |
| Review UI | `apps/web/src/app/review/page.tsx` — approval queue: preview tailored resume + cover letter, one-click approve or withdraw |
| pipeline-tracker | `packages/pipeline-tracker/src/supabase.ts` (status transitions) + `notion.ts` (stub sync) |

### Key Patterns Applied
- **ATS knowledge base** — per-company quirks + per-ATS playbooks for Workday/Greenhouse/Lever
- **Persistent browser profiles** — accumulates authenticated sessions across runs to skip re-auth
- **User approval gate** — every application requires explicit user sign-off before Playwright submits
- **Pipeline status machine** — `pending → tailoring → awaiting_approval → applying → applied / failed`

### Deliverable
One-click "Auto Apply" with resume tailoring and user approval gate. Full pipeline: scout → score → tailor → review → apply → track.

---

## Phase 0 — Rename to PitchFire (✅ Merged · PR #4)

**Commit:** `5f8416d` · **Date:** 2026-10-13

### What Changed
- All `jobpilot-ai` / `@jobpilot/*` / `JobPilot` references replaced with `pitchfire` / `@pitchfire/*` / `PitchFire` (39 files)
- All `Applymatic` docs references replaced with `PitchFire` (7 docs files)
- `pnpm-lock.yaml` regenerated with new `@pitchfire/*` scope
- GitHub repo renamed from `Claude_Plans-` → `pitchfire`
- Browser profile path: `~/.jobpilot/` → `~/.pitchfire/`

---

## Phase 3 — Communication Layer (✅ Done · PR #6)

**Branch:** `feature/phase-3-communication-layer` · **Date:** 2026-10-13

### What Was Built

| Area | Files |
|---|---|
| voyage-3-lite embedder | `packages/resume-engine/src/embedder.ts` — replaced sin/cos mock with `voyageai` SDK (1024-dim true dense vectors); falls back to stub when `VOYAGE_API_KEY` unset |
| DB migration | `supabase/migrations/002_voyage_embeddings.sql` — columns + IVFFlat index resized 1536 → 1024 |
| InboxAgent | `apps/agent/src/agents/inbox.agent.ts` — Claude tool-use loop over `gmail_search_threads` + `gmail_get_thread`; Haiku classifier; fuzzy company-domain matching; auto-updates application status; DLQ on failure |
| SchedulerAgent | `apps/agent/src/agents/scheduler.agent.ts` — new file; Haiku extracts interview details (confidence gate < 0.8 → flags for user); Sonnet generates prep notes; Google Calendar API creates event; Supabase session record |
| 3-queue worker | `apps/agent/src/worker.ts` — split single `agent-jobs` queue into `discovery-queue` (c=6), `apply-queue` (c=2), `comms-queue` (c=4); DLQ push on 3rd failure; SIGTERM drain |
| Queue router | `apps/api/src/common/queue.ts` — `enqueueAgentJob()` routes by job type to correct queue |
| Sessions API | `apps/api/src/modules/sessions/` — `sessions.module.ts`, `sessions.service.ts`, `sessions.controller.ts` (`GET /sessions/:userId`, `GET /sessions/detail/:id`, `PATCH /sessions/:id`) |
| App module | `apps/api/src/app.module.ts` — added `SessionsModule` |
| Stealth browser fix | `packages/job-scraper/src/browser.ts` — `navigator.plugins` integer array → real `Plugin` objects (R&D fix) |
| Env vars | `.env.example` — added `VOYAGE_API_KEY`, `GMAIL_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ACCESS_TOKEN` |

### Key Patterns Applied (from R&D findings)
- **voyage-3-lite** — true 1024-dim dense embeddings at $0.02/M tokens; pgvector scores now semantically valid
- **Gmail tool-use loop** — Claude drives `gmail_search_threads → gmail_get_thread → classify` in a 5-round max loop; ~$0.001/email
- **Confidence gate** — scheduler auto-books only when Haiku extraction confidence ≥ 0.8; else flags for user
- **3 typed queues** — prevents slow scout jobs from blocking apply/comms paths
- **DLQ** — on 3rd BullMQ failure, raw payload pushed to `pitchfire:dlq` Redis list
- **Plugin object fix** — reduces bot-detection hit rate on Wellfound/LinkedIn

### Deliverable
Auto-detect interview invites in Gmail → extract date/time → create Google Calendar event → generate Sonnet-quality prep notes → update Supabase sessions table → expose via `GET /sessions/:userId`.

---

## Phase 4 — Intelligence & Polish (🔲 Next)

**Branch:** `feature/phase-4-intelligence`

| File | Description |
|---|---|
| `apps/web/src/app/analytics/page.tsx` | Funnel: applied → reply → interview → offer |
| `apps/agent/src/agents/coach.agent.ts` | Interview Q&A generator per company + role (Sonnet) |
| `apps/api/src/modules/notifications/` | Slack MCP push for key events |
| `@bull-board/express` at `/admin/queues` | Queue observability behind `ADMIN_TOKEN` header |

---

## Phase 5 — SaaS Layer (🔲 Queued)

**Branch:** `feature/phase-5-saas`

| File | Description |
|---|---|
| `apps/api/src/modules/billing/` | Stripe webhooks, plan enforcement (free / pro / agency) |
| `apps/web/src/app/(marketing)/` | Landing page with pricing table |
| `apps/api/src/modules/tenants/` | Agency mode: manage multiple user profiles |
| `apps/web/src/app/admin/` | Usage dashboard, billing portal |

**Break-even:** 2 Pro users × $29/mo = $58/mo > $50/mo infra cost.

---

## Architecture Quick Reference

```
Orchestrator (Sonnet 4.6)
│
├── ScoutAgent      Playwright + RemoteOK JSON → raw job listings
├── ScorerAgent     Haiku + pgvector cosine → score 0–1
├── TailorAgent     Sonnet → resume variant + cover letter (critique loop)
├── ApplierAgent    Playwright headless → ATS form fill + submit
├── TrackerAgent    Supabase status transitions + Notion sync
├── InboxAgent      Gmail tool-use loop → Haiku classifier → pipeline update
└── SchedulerAgent  Google Calendar API → event + Sonnet prep notes
```

**Queues (Phase 3):**
- `discovery-queue` (c=6) — scout, score
- `apply-queue` (c=2) — tailor, apply
- `comms-queue` (c=4) — inbox, schedule

**DB:** Supabase — tables: `users` · `resumes` · `job_listings` · `applications` · `pipeline_events` · `sessions`  
**Embeddings:** pgvector 1024-dim (voyage-3-lite), ivfflat index, `similarity_top_k=10`

---

## R&D Findings

> Researched 2026-10-13. Top 5 priorities ranked by impact. All applied in Phase 3.

### Top 5 Implementation Priorities

| Priority | Change | Impact | Status |
|---|---|---|---|
| 1 | Replace deterministic embedder with `voyage-3-lite` | Makes pgvector scores semantically valid | ✅ Done (Phase 3) |
| 2 | Implement InboxAgent Gmail tool-use loop | Unlocks Phase 3 core feature | ✅ Done (Phase 3) |
| 3 | Split single queue into 3 typed queues | Prevents scout jobs blocking apply jobs | ✅ Done (Phase 3) |
| 4 | Fix `navigator.plugins` spoofing (integer array → Plugin objects) | Reduces bot detection | ✅ Done (Phase 3) |
| 5 | Add Bull Board admin UI + DLQ on 3rd failure | Observability + recoverable failure handling | ⏳ DLQ done; Bull Board → Phase 4 |

---

### Area 1 — Multi-Agent Orchestration

**Finding:** BullMQ `switch` dispatcher should be wrapped in a thin Claude tool-use loop — the orchestrator model reads job metadata and calls the right tool, giving retry/self-correction for free. ScoutAgent currently runs board scrapes sequentially; `Promise.all` fan-out would cut scout time by ~N×.

**Action for Phase 3:** Wrap dispatcher in Haiku tool-use loop. Fan-out ScoutAgent board scrapes.

**Risk:** Tool-use loops add ~200–400 ms per Haiku hop. Keep orchestrator on Haiku; reserve Sonnet for generate/revise steps only.

---

### Area 2 — Job Board Scraping

**Finding:** Current `navigator.plugins` override was setting integer array `[1,2,3,4,5]` — a known bot signature. Real browsers return Plugin objects. LinkedIn uses TLS JA3 fingerprinting + CDP detection. Indeed switched to Cloudflare Turnstile in late 2024.

**Applied in Phase 3:**
1. Fixed plugins override: returns 3 real Plugin objects (Chrome PDF Plugin, Chrome PDF Viewer, Native Client)
2. LinkedIn → use LinkedIn Jobs API (free, 500 req/day) instead of Playwright — Phase 4 backlog
3. Indeed → use Indeed `publisher` API instead of scraping — Phase 4 backlog
4. Random mouse jitter between Wellfound card reads — existing pattern

---

### Area 3 — Resume Tailoring Quality

**Critical finding resolved in Phase 3:** Replaced deterministic `sin/cos` embedder with `voyage-3-lite` (1024-dim). pgvector similarity scores are now semantically valid.

**Remaining improvement (Phase 4):** Score-gated critique loop: change from fixed 2-round `for` loop to `while (score < 0.8 && round < 3)` with Haiku faithfulness/relevancy scoring.

---

### Area 4 — NestJS + BullMQ

**Applied in Phase 3:** Split into 3 queues (`discovery-queue`, `apply-queue`, `comms-queue`). DLQ on 3rd failure.

**Remaining (Phase 4):** Add `@bull-board/express` at `/admin/queues` behind `ADMIN_TOKEN` header.

---

### Area 5 — Gmail + Google Calendar

**Applied in Phase 3:** Full InboxAgent Gmail tool-use loop (max 5 rounds) + SchedulerAgent with Calendar API event creation. See Phase 3 section for implementation details.

---

## PR Template (for each future phase PR)

Each PR description must include:

```
## Phase N — [Name]

### What this PR delivers
- <bullet per file group>

### Implementation notes
- <key patterns, decisions, gotchas>

### Verification
- <how to test the deliverable end-to-end>

### Reference: PROGRESS.md
docs/PROGRESS.md updated — see Phase N section.
```

---

## Branch Naming Convention (from Phase 3 onwards)

| Phase | Branch |
|---|---|
| Phase 1 | `feature/phase-1-foundation` |
| Phase 2 | `feature/phase-2-apply-automation` |
| Phase 0 | `feature/rename-to-pitchfire` |
| Phase 3 | `feature/phase-3-communication-layer` |
| Phase 4 | `feature/phase-4-intelligence` |
| Phase 5 | `feature/phase-5-saas` |

---

## Deployment Path

| Stage | Cost | When |
|---|---|---|
| Local Docker Compose | $0 | Now |
| Vercel + Railway + Supabase + Upstash free tiers | $0 | After Phase 3 |
| Vercel Pro + Railway Starter + Supabase Pro | $50/mo | First 2 paying users |

---

*Last updated: 2026-10-13 · Phase 3 complete · Phase 4 next*
