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

**Commit:** `a2b0685` · **Date:** 2025-10-12

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

**Commit:** `54ef593` · **Date:** 2025-10-12

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

**Commit:** `5f8416d` · **Date:** 2025-10-13

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

> Researched 2025-10-13. Top 5 priorities ranked by impact.

### Top 5 Implementation Priorities

| Priority | Change | Impact | Phase |
|---|---|---|---|
| 1 | Replace deterministic embedder with `voyage-3-lite` | Makes pgvector scores semantically valid | Phase 3 prep |
| 2 | Implement InboxAgent Gmail MCP tool-use loop | Unlocks Phase 3 core feature | Phase 3 |
| 3 | Split single queue into 3 typed queues | Prevents scout jobs blocking apply jobs | Phase 3 |
| 4 | Fix `navigator.plugins` spoofing (integer array → Plugin objects) | Reduces bot detection on Wellfound/LinkedIn | Phase 3 |
| 5 | Add Bull Board admin UI + DLQ on 3rd failure | Observability + recoverable failure handling | Phase 4 |

---

### Area 1 — Multi-Agent Orchestration

**Finding:** BullMQ `switch` dispatcher should be wrapped in a thin Claude tool-use loop — the orchestrator model reads job metadata and calls the right tool, giving retry/self-correction for free. ScoutAgent currently runs board scrapes sequentially; `Promise.all` fan-out would cut scout time by ~N×.

**Action for Phase 3:** Wrap dispatcher in Haiku tool-use loop. Fan-out ScoutAgent board scrapes.

**Risk:** Tool-use loops add ~200–400 ms per Haiku hop. Keep orchestrator on Haiku; reserve Sonnet for generate/revise steps only.

---

### Area 2 — Job Board Scraping

**Finding:** Current `navigator.plugins` override sets integer array `[1,2,3,4,5]` — a known bot signature. Real browsers return Plugin objects. LinkedIn uses TLS JA3 fingerprinting + CDP detection; raw Playwright sessions are fingerprinted since mid-2024. Indeed switched to Cloudflare Turnstile in late 2024 — scraping is now unreliable.

**Actions:**
1. Fix plugins override: `Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', ... }] })`
2. **LinkedIn** → use LinkedIn Jobs API (free, 500 req/day) instead of Playwright
3. **Indeed** → use Indeed `publisher` API (`api.indeed.com/ads/apisearch`, free non-commercial) instead of scraping
4. Add random `page.mouse.move()` jitter between Wellfound card reads
5. Rotate browser profiles every 48 hours — stable profiles create stable fingerprints

---

### Area 3 — Resume Tailoring Quality

**Critical finding:** The current embedder in `packages/resume-engine/src/embedder.ts` uses deterministic `sin/cos` encoding — not real dense vectors. pgvector similarity scores have no semantic meaning; the 0.72 threshold is arbitrary.

**Fix:** Replace with `voyage-3-lite` (Voyage AI npm package) — true 1024-dim dense embeddings at $0.02/M tokens. Update schema + pgvector index from 1536 → 1024 dims.

**Critique loop improvement:** Change from fixed 2-round `for` loop to score-gated `while (score < 0.8 && round < 3)`. Use Haiku to output `{ faithfulness: 0-1, answer_relevancy: 0-1, context_precision: 0-1 }` as JSON after each round; gate on all three > 0.75.

**Reranking pattern:** After pgvector `<=>` retrieval, pass top-20 `(resume_chunk, jd_chunk)` pairs to Haiku for faithfulness + relevance scoring, return top-5. More accurate than cosine alone.

---

### Area 4 — NestJS + BullMQ

**Finding:** Single `agent-jobs` queue means slow `scout` jobs block queue inspection for `tailor` jobs. BullMQ v5 supports per-job `priority` (1 = highest) and multiple queues.

**Actions for Phase 3:**
1. Split into 3 queues: `discovery-queue` (scout + score, concurrency 6), `apply-queue` (tailor + apply, concurrency 2), `comms-queue` (inbox + schedule, concurrency 4)
2. Add `@bull-board/express` at `/admin/queues` behind `ADMIN_TOKEN` header check
3. DLQ: on 3rd failure, push to `pitchfire:dlq` Redis key with full job payload
4. Emit `pipeline_events` failure rows — agents currently don't write failure events
5. Register `process.on('SIGTERM', () => worker.close())` to drain in-flight jobs on shutdown

**Upstash note:** Use `enableOfflineQueue: false` and a single shared Redis connection per worker — Upstash serverless charges per command.

---

### Area 5 — Gmail + Google Calendar MCP (Phase 3)

**InboxAgent implementation pattern:**
```typescript
// Tool-use loop: search → get thread → classify → update status
tools: [gmail_search_threads, gmail_get_thread]
query: 'from:careers OR from:recruiting label:INBOX after:YYYY/MM/DD'
// Per thread: pass subject + first 500 chars to classifyJobEmail (Haiku)
// Cost: ~$0.001 per classification
```

**Reply correlation:** fuzzy-match `sender_domain` against `job_listings.company` — `sender_domain.includes(company.toLowerCase().replace(/\s+/g, ''))` covers 80% of cases.

**Calendar event creation:** Use Haiku structured output to extract `{ interview_date: ISO8601, duration_minutes: number, location: string | null }`. If extraction confidence < 0.8, flag for user confirmation instead of auto-booking.

**Polling cadence:** Single 15-min BullMQ cron (`repeat: { every: 900_000 }`) that fans out one `inbox` job per user with `applied` applications — not per-user standing jobs.

**Gmail rate limits:** 250 quota units/second per user. 20 applications = 200 units/poll — safely within limits. For agency mode: use BullMQ `limiter: { max: 40, duration: 1000 }`.

**Classify `offer` and `followup`:** Both are in the type union but `InboxAgent` never acts on them. Wire them up: `offer` → notify user via Slack, `followup` → log pipeline event.

---

### Confirmed patterns already in use
- **Provider-agnostic model routing** — Haiku for cheap/fast (scoring, classification), Sonnet for quality (tailor, apply)
- **ATS knowledge base** — `knowledge/skills/ats_playbooks/` + `knowledge/skills/dropdowns/` structure
- **User approval gate** — every application requires explicit user sign-off before Playwright submits
- **Integrity check** — post-tailor verification that no fabricated employers/roles were introduced

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

*Last updated: 2025-10-13 · Phase 2 complete · R&D complete · Phase 3 next*
