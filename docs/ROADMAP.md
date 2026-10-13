# Roadmap — PitchFire

## Phase Status

| Phase | Name | Status | PR |
|---|---|---|---|
| 1 | Foundation | ✅ Merged | #1 |
| 2 | Apply Automation | ✅ Merged | #2 |
| 3 | Communication Layer | 🔜 Next | — |
| 4 | Intelligence & Polish | 🔜 Planned | — |
| 5 | SaaS Layer | 🔜 Planned | — |

---

## Phase 1 — Foundation ✅

**Deliverable**: User uploads resume → sees ranked job feed with match scores.

### What was built
- `pnpm-workspace.yaml` + `turbo.json` — monorepo skeleton
- `docker-compose.yml` — Supabase local + Redis
- `supabase/migrations/001_init.sql` — full schema with pgvector, RLS, `match_jobs_for_resume()` RPC
- `packages/shared` — Zod schemas + AgentJob discriminated union
- `packages/resume-engine` — PDF parse, two-step embedding (Haiku summary + 1536-dim vector), Haiku scorer with faithfulness retry
- `packages/job-scraper` — Playwright stealth browser, RemoteOK JSON API scraper, Wellfound Playwright scraper, concurrent multi-board with `Promise.allSettled`
- `apps/api` — NestJS scaffold: ResumeModule, JobsModule, AgentsModule, PipelineModule
- `apps/agent` — BullMQ Worker (concurrency:4): ScoutAgent, ScorerAgent, TailorAgent stub, InboxAgent stub
- `apps/web` — Next.js 14 dashboard: /dashboard, /jobs, /applications, /sessions

---

## Phase 2 — Apply Automation ✅

**Deliverable**: One-click "Auto Apply" with resume tailoring and user approval gate.

### What was built
- `packages/pipeline-tracker` — `recordTransition()`, `storeAppliedConfirmation()`, `getApplicationWithDetails()`, `getPendingReviewApplications()`, Notion sync stub
- `apps/agent/knowledge/skills/ats_playbooks/` — Workday, Greenhouse, Lever markdown playbooks (selectors, quirks, navigation patterns)
- `apps/agent/src/agents/applier.agent.ts` — ATS detection, stealth Chromium with persistent per-user browser profiles, Claude Sonnet DOM analysis → JSON actions array → form fill/submit
- `apps/agent/src/worker.ts` — wired `apply` job type to `runApplierAgent`
- `apps/api/src/modules/apply/` — `GET /apply/pending/:userId`, `POST /apply/:id` (approve → enqueue / withdraw)
- `apps/web/src/app/review/page.tsx` — approval queue UI with expandable tailored resume + cover letter preview

---

## Phase 3 — Communication Layer 🔜

**Deliverable**: Auto-detect interview invites → create calendar events → generate prep notes.

### Files to create

```
apps/agent/src/agents/
├── inbox.agent.ts        — Gmail MCP polling loop + Claude Haiku reply classifier
└── scheduler.agent.ts    — Google Calendar MCP event creation + prep notes

apps/web/src/app/
└── sessions/             — Interview calendar view with prep notes (already shell exists)

apps/api/src/modules/
└── sessions/             — GET /sessions/:userId, PATCH /sessions/:id
```

### Agent design

**InboxAgent**
- Input: `{ user_id }`
- Gmail MCP: search threads matching company names from `applied` applications
- Claude Haiku classifies each: `interview` / `reject` / `ghosted` / `offer`
- Updates `applications.status`
- Enqueues `schedule` job if `interview` detected

**SchedulerAgent**
- Input: `{ application_id, email_thread_id }`
- Extracts interview time from thread
- Google Calendar MCP: create event with Google Meet link
- Claude Sonnet: generate prep notes (company research + role-specific Q&A)
- Stores in `sessions` table

---

## Phase 4 — Intelligence & Polish 🔜

**Deliverable**: Analytics funnel, interview CoachAgent, Slack notifications.

### Files to create

```
apps/web/src/app/
└── analytics/            — Funnel: applied → replied → interview → offer

apps/agent/src/agents/
└── coach.agent.ts        — Interview Q&A generator per company + role

apps/api/src/modules/
└── notifications/        — Slack MCP push on key events
```

### CoachAgent design
- Input: `{ session_id }`
- Loads company info (Crunchbase / public web)
- Loads job description
- Claude Sonnet generates: 10 likely interview questions + suggested answers
- Stores as `sessions.prep_notes`

---

## Phase 5 — SaaS Layer 🔜

**Deliverable**: Multi-tenant, Stripe billing, agency mode, public landing page.

### Files to create

```
apps/api/src/modules/
├── billing/              — Stripe webhooks, plan enforcement middleware
└── tenants/              — Agency: manage multiple user profiles

apps/web/src/app/
├── (marketing)/          — Landing page with pricing
│   ├── page.tsx          — Hero + features + pricing table
│   └── pricing/page.tsx
└── admin/                — Usage dashboard, billing portal
    ├── page.tsx          — Metrics overview
    └── billing/page.tsx  — Stripe customer portal embed
```

### Pricing enforcement
- Middleware reads `users.plan` from JWT claim
- Free: block `enqueueAgentJob` when `applications.count > 10`
- Pro: unlimited
- Agency: multi-profile support, `user_id` can be a team member

### Stripe integration
- Checkout session created on plan upgrade
- Webhook updates `users.plan` + `users.stripe_customer_id`
- Customer portal for self-serve subscription management

---

## Key Metrics to Track (Phase 4 analytics)

| Metric | Target |
|---|---|
| Resume → Job match rate | > 72% threshold |
| Apply success rate | > 80% (forms filled without bounce) |
| Reply rate | > 15% (industry avg: 8-12%) |
| Interview conversion | > 30% of replies |
| Time to apply | < 3 min per application |
| Latency: score → tailor | < 30s |
| Latency: tailor → apply | < 60s |
