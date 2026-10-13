# PitchFire — Original Product Plan
## Complete Build, Test, Deploy & Monetize Strategy

> This document is the original engineering plan that guided the PitchFire build. It captures the context, architectural decisions, reference patterns borrowed from existing open-source projects, and the phase-by-phase delivery roadmap. Preserved verbatim as a decision log.

---

## Context

Jawad Ul Hadi (Backend Lead/Architect) wants an end-to-end AI-powered job search platform that:
- Discovers matching jobs across all major job boards
- Scores JD against resume (RAG + vector similarity)
- Auto-tailors resume variants and cover letters per job
- Submits applications autonomously via browser automation
- Manages the full pipeline: emails, calendar, interview sessions
- Earns revenue as a SaaS product

The repo `jawadulhadi/claude_plans-` was a blank slate (just LICENSE + README). This was a greenfield build.

---

## Unique Angle: What Makes This Different

Most job tools are search wrappers. **PitchFire** is a **multi-agent Claude orchestrator** where each agent owns a domain, communicates via a job pipeline queue, and plugs into the user's existing stack (Gmail, Calendar, Notion, Slack) via MCP connectors — not third-party integrations bolted on later.

The differentiators:
1. **Resume Variant Engine** — one base resume → tailored variant per application (user's own career strategy, applied systematically for every applicant)
2. **Latency-aware agent routing** — fast Haiku for scoring/routing, Sonnet for tailoring/cover letters
3. **Earned-income pipeline** — apply on behalf of others (agency mode) at the same infra cost

---

## Architecture

### Monorepo Structure
```
pitchfire/
├── apps/
│   ├── web/                   # Next.js 14 App Router — dashboard
│   ├── api/                   # NestJS — REST + WebSocket
│   └── agent/                 # Claude multi-agent orchestrator (Node.js)
├── packages/
│   ├── resume-engine/         # Parse, score, generate variants
│   ├── job-scraper/           # Playwright-based multi-board scraper
│   ├── pipeline-tracker/      # Supabase + Notion sync
│   └── shared/                # Zod schemas, TypeScript types, utils
├── supabase/
│   ├── migrations/            # DB schema
│   └── seed.sql
├── docker-compose.yml         # Local: Supabase + Redis + API + Web
└── pnpm-workspace.yaml
```

### Agent Architecture (7 Agents)
```
Orchestrator (Claude Sonnet 4.6)
│
├── ScoutAgent      → Discovers jobs from 10+ boards
├── ScorerAgent     → RAG-based JD↔Resume match (Claude Haiku 5.5)
├── TailorAgent     → Generates resume variant + cover letter (Sonnet)
├── ApplierAgent    → Playwright form-filler + submit
├── TrackerAgent    → Writes to Supabase + Notion pipeline
├── InboxAgent      → Gmail MCP — monitors replies, classifies outcomes
└── SchedulerAgent  → Google Calendar MCP — books/tracks interviews
```

Each agent is a Claude tool-use loop that publishes events to a **BullMQ queue** (Redis). The Orchestrator subscribes and routes.

### Data Flow
```
1. Resume uploaded → Supabase Storage → embeddings generated (pgvector)
2. ScoutAgent → raw job listings → ScorerAgent → score > 0.72 → queue
3. TailorAgent → resume variant + cover letter → user approval (web dashboard)
4. ApplierAgent → Playwright headless → submit → TrackerAgent logs it
5. InboxAgent polls Gmail → reply detected → classify (interview/reject/ghosted)
6. SchedulerAgent → interview detected → calendar event created + prep reminder
```

### Tech Stack
| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui | SSR, fast, free on Vercel |
| Backend API | NestJS + TypeScript | Matches user's existing expertise |
| AI Engine | Claude Sonnet 4.6 / Haiku 5.5 / Opus 5.5 | Model-per-task routing |
| Database | Supabase (PostgreSQL + pgvector) | Vector search built-in, generous free tier |
| Queue | BullMQ + Redis | Async agent jobs, retry logic |
| Scraping | Playwright (pre-installed in CCR) | Already available, no extra deps |
| Email | Gmail MCP connector | Already available in this session |
| Calendar | Google Calendar MCP | Already available in this session |
| Tracking | Notion MCP + Supabase | Dual: DB for query, Notion for human view |
| Notifications | Slack MCP | Available |
| Auth | Supabase Auth (OAuth: Google) | Free, simple |
| Payments | Stripe | Standard |
| Monorepo | pnpm workspaces | Fast, compatible with NestJS + Next.js |

---

## Database Schema (Supabase)

### Key Tables
```sql
users            — id, email, plan (free/pro/agency), stripe_customer_id
resumes          — id, user_id, content_text, embedding vector(1536), variants jsonb
job_listings     — id, title, company, board, url, jd_text, embedding vector(1536), scraped_at
applications     — id, user_id, job_id, resume_variant_id, status, applied_at, score float
pipeline_events  — id, app_id, event_type, payload jsonb, created_at
sessions         — id, user_id, app_id, type (interview/followup), scheduled_at, prep_notes
```

---

## Build Phases

### Phase 1 — Foundation ✅ Complete
**Goal**: Scout + Score + Dashboard (core loop, no apply yet)

Deliverable: User uploads resume → sees ranked job feed with match scores.

### Phase 2 — Apply Automation ✅ Complete
**Goal**: TailorAgent + ApplierAgent + TrackerAgent

Deliverable: One-click "Auto Apply" with resume tailoring and user approval gate.

### Phase 3 — Communication Layer 🔜 Next
**Goal**: InboxAgent + SchedulerAgent

Files to create:
- `apps/agent/src/agents/inbox.agent.ts` — Gmail MCP polling loop + reply classifier
- `apps/agent/src/agents/scheduler.agent.ts` — Calendar event creation via Google Calendar MCP
- `apps/web/src/app/sessions/` — Interview calendar view + prep notes

Deliverable: Auto-detect interview invites → create calendar events → generate prep notes.

### Phase 4 — Intelligence & Polish 🔜 Planned
**Goal**: Analytics, salary negotiation coach, bulk apply

Files to create:
- `apps/web/src/app/analytics/` — funnel: applied → reply → interview → offer
- `apps/agent/src/agents/coach.agent.ts` — interview Q&A generator per company + role
- `apps/api/src/modules/notifications/` — Slack MCP push for key events

### Phase 5 — SaaS Layer 🔜 Planned
**Goal**: Multi-tenant, Stripe billing, agency mode

Files to create:
- `apps/api/src/modules/billing/` — Stripe webhooks, plan enforcement
- `apps/web/src/app/(marketing)/` — Landing page with pricing
- `apps/api/src/modules/tenants/` — Agency: manage multiple user profiles
- `apps/web/src/app/admin/` — Usage dashboard, billing portal

---

## Reference Patterns Adopted

### From kedster/jobautopilot-claude (Most Relevant)
- **Model-per-task routing**: `haiku` → job discovery/filtering; `sonnet` → form-filling; `opus` → resume tailoring
- **Conveyor belt parallelism**: scout + score + inbox enqueued concurrently
- **Self-updating ATS knowledge base**: `knowledge/skills/ats_playbooks/` (Workday/Ashby/Greenhouse/Lever recipes)
- **Model fallback chain**: `sonnet → opus → haiku` on rate limit
- **Persistent browser profiles**: `~/.pitchfire/browser_profiles/` — accumulates authenticated sessions
- **Integrity check pattern**: Haiku verifies no fabricated employers after tailoring

### From sreekarrs/JobSearch-Agent
- **LoopAgent for document quality**: critique → revise → fact-check loop (max iterations) → final draft
- **LinkedIn anonymized scraper**: random user agents, timezone/WebGL masking
- **Dual sync/async pipeline**: same agent logic serves both CLI and web API

### From kyosek/RAG-based-job-search-assistant
- **CV-as-RAG-context pattern**: parse user PDF → inject full text alongside JD chunks
- **Self-evaluation loop**: score for `faithfulness` + `relevancy`, retry up to 3x
- **`similarity_top_k=10`**: retrieve 10 nearest jobs, re-rank with Claude

### From vercel-labs/knowledge-agent-template
- **Complexity router**: classify task → route to cheap (haiku) vs. powerful (opus)
- **Multi-platform adapter pattern**: one agent codebase → web, Slack bot, Discord bot
- **Admin agent**: `query_stats`, `query_errors`, `run_sql` for operational observability
- **Vercel-native deployment**: one-click deploy with env var config

---

## Local Development Setup

```bash
# 1. Clone + install
git clone repo && cd pitchfire
pnpm install

# 2. Start local infra
docker-compose up -d   # Supabase local, Redis

# 3. Apply DB migrations
npx supabase db push

# 4. Set env vars
cp .env.example .env.local

# 5. Start all services
pnpm dev   # runs web + api + agent concurrently (turbo)
```

---

## Deployment: Local → Cloud (Economical Path)

### Stage 2: Cloud Free Tier (~$0/mo)
Stack: **Vercel (web) + Railway (api + agent) + Supabase + Upstash**

### Stage 3: First Revenue (~$50/mo infra)
| Service | Cost |
|---|---|
| Railway Starter | $5/mo |
| Supabase Pro | $25/mo |
| Vercel Pro | $20/mo |
| **Total** | **$50/mo** |

Break-even: **2 Pro users at $29/mo** → profitable from user #2.

---

## Monetization

| Plan | Price | Target |
|---|---|---|
| Free | $0/mo | Trial / hobby |
| Pro | $29/mo | Active job seekers |
| Agency | $99/mo | Recruiters / career coaches |

Additional: Resume Review ($49), Interview Coaching ($29), API Access ($99/mo).
