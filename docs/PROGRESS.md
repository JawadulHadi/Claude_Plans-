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
| 0 | Repo + Name | ✅ Done | [#4][pr4] | `ccr-a0e32090-nssuxe` |
| 1 | Foundation — Scout + Score + Dashboard | ✅ Done | [#1][pr1] | `ccr-a0e32090-nssuxe` |
| 2 | Apply Automation | ✅ Done | [#3][pr3] | `ccr-a0e32090-nssuxe` |
| 3 | Communication Layer | 🔲 Next | — | — |
| 4 | Intelligence & Polish | 🔲 Queued | — | — |
| 5 | SaaS Layer | 🔲 Queued | — | — |

[pr1]: https://github.com/JawadulHadi/pitchfire/pull/1
[pr3]: https://github.com/JawadulHadi/pitchfire/pull/3
[pr4]: https://github.com/JawadulHadi/pitchfire/pull/4

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
- **Conveyor belt parallelism** (from kedster/jobautopilot-claude) — scout + score + inbox run concurrently via `Promise.allSettled`
- **LoopAgent critique/revise** (from sreekarrs/JobSearch-Agent) — up to 2 revision rounds on resume variants
- **Faithfulness self-eval** (from kyosek/RAG-job-search) — retry up to 3× on resume scoring if parse fails
- **Integrity check** (kedster) — post-tailor verification that no fabricated employers/roles were introduced
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
- **ATS knowledge base** (kedster) — per-company quirks + per-ATS playbooks for Workday/Greenhouse/Lever
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

**Verification:** `grep -r "jobpilot\|Applymatic" --include="*.ts,*.tsx,*.json,*.md" . --exclude-dir=node_modules` → 0 results.

---

## Phase 3 — Communication Layer (🔲 Next)

**Goal:** Auto-detect interview invites → create calendar events → generate prep notes.

### Files to Create

| File | Description |
|---|---|
| `apps/agent/src/agents/inbox.agent.ts` | Gmail MCP polling loop + Claude Haiku reply classifier (interview / reject / ghosted / other) |
| `apps/agent/src/agents/scheduler.agent.ts` | Google Calendar MCP: create event + generate prep notes via Sonnet |
| `apps/api/src/modules/sessions/sessions.module.ts` | NestJS module: `GET /sessions/:userId`, `PATCH /sessions/:id` |
| `apps/web/src/app/sessions/page.tsx` | Interview calendar view + prep notes panel |
| New BullMQ job types | `inbox` (poll Gmail) + `schedule` (create calendar event) |

### Deliverable
Auto-detect interview invites → create Google Calendar events with AI-generated prep notes → update Notion pipeline board.

---

## Phase 4 — Intelligence & Polish (🔲 Queued)

| File | Description |
|---|---|
| `apps/web/src/app/analytics/page.tsx` | Funnel: applied → reply → interview → offer |
| `apps/agent/src/agents/coach.agent.ts` | Interview Q&A generator per company + role (Sonnet) |
| `apps/api/src/modules/notifications/` | Slack MCP push for key events |

---

## Phase 5 — SaaS Layer (🔲 Queued)

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
├── InboxAgent      Gmail MCP → Haiku classifier → pipeline update   [Phase 3]
└── SchedulerAgent  Google Calendar MCP → event + prep notes          [Phase 3]
```

**Queue:** BullMQ on Redis — job types: `scout` · `score` · `tailor` · `apply` · `inbox` · `schedule`  
**DB:** Supabase — tables: `users` · `resumes` · `job_listings` · `applications` · `pipeline_events` · `sessions`  
**Embeddings:** pgvector 1536-dim, ivfflat index, `similarity_top_k=10`

---

## R&D Findings

> Populated from parallel research. Updated as findings arrive.

### Confirmed patterns in use
- **Provider-agnostic model routing** — Haiku for cheap/fast (scoring, classification), Sonnet for quality (tailor, apply), Opus available for future upgrade
- **Stealth Playwright** — random user-agent rotation, WebGL masking (adopted from sreekarrs/JobSearch-Agent)
- **Self-evaluation loop** — faithfulness + relevancy score after each tailor; retry ≤3× before surfacing to user
- **ATS knowledge base** — `knowledge/skills/ats_playbooks/` + `knowledge/skills/dropdowns/` structure (kedster pattern)

### Pending R&D (see inline findings when agent completes)
- BullMQ v5 job prioritization + dead letter queue patterns
- Gmail MCP reply classification prompt engineering
- Google Calendar MCP event creation + recurrence handling
- LinkedIn scraping anti-bot mitigations (2025)

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

## Deployment Path

| Stage | Cost | When |
|---|---|---|
| Local Docker Compose | $0 | Now |
| Vercel + Railway + Supabase + Upstash free tiers | $0 | After Phase 3 |
| Vercel Pro + Railway Starter + Supabase Pro | $50/mo | First 2 paying users |

---

*Last updated: 2026-10-13 · Phase 2 complete · Phase 3 next*
