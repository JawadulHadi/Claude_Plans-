# Development Guide — PitchFire

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 22 | `nvm install 22` |
| pnpm | ≥ 10 | `npm i -g pnpm@latest` |
| Docker | any recent | docker.com |
| Git | any | — |

---

## Initial Setup

```bash
# 1. Clone
git clone https://github.com/JawadulHadi/PitchFire.git
cd PitchFire

# 2. Install all workspace packages
pnpm install

# 3. Start local infrastructure (Supabase + Redis)
docker-compose up -d

# 4. Wait ~20s for Supabase to boot, then apply migrations
pnpm supabase db push --local

# 5. Copy environment template
cp .env.example .env.local
# Edit .env.local — see Environment Variables section below

# 6. Start all services in parallel
pnpm dev
```

Services started by `pnpm dev`:
- `http://localhost:3000` — Next.js web dashboard
- `http://localhost:3001` — NestJS REST API  
- `http://localhost:3001/docs` — Swagger UI
- `http://localhost:6379` — Redis (Docker)
- `http://localhost:54323` — Supabase Studio (Docker)
- Agent worker — BullMQ consumer (background process)

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# AI
ANTHROPIC_API_KEY=sk-ant-...       # Required for all agents

# Supabase (local Docker)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=...              # From supabase start output
SUPABASE_SERVICE_ROLE_KEY=...      # From supabase start output

# Redis
REDIS_URL=redis://localhost:6379

# User profile (Phase 5: pulled from Supabase users table)
USER_FIRST_NAME=Jawad
USER_LAST_NAME=Ul Hadi
USER_EMAIL=your@email.com
USER_PHONE=+1234567890
USER_LOCATION=Remote
USER_LINKEDIN=https://linkedin.com/in/yourhandle

# Optional: MCP connectors (Phase 3+)
NOTION_DATABASE_ID=...             # Notion pipeline board ID
SLACK_WEBHOOK_URL=...              # Slack incoming webhook

# Optional: Stripe (Phase 5)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Monorepo Structure

```
pitchfire/
├── apps/
│   ├── web/                       # Next.js 14 App Router
│   │   ├── src/app/
│   │   │   ├── layout.tsx         # Nav + dark theme shell
│   │   │   ├── page.tsx           # Landing / redirect
│   │   │   ├── dashboard/         # Resume upload + pipeline summary
│   │   │   ├── jobs/              # Matched jobs feed
│   │   │   ├── review/            # Approval queue (Phase 2)
│   │   │   ├── applications/      # Pipeline funnel
│   │   │   └── sessions/          # Interview calendar (Phase 3)
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   ├── api/                       # NestJS REST API
│   │   ├── src/
│   │   │   ├── main.ts            # Bootstrap, Swagger, CORS
│   │   │   ├── app.module.ts      # Root module
│   │   │   ├── common/
│   │   │   │   ├── supabase.ts    # Singleton Supabase client
│   │   │   │   └── queue.ts       # BullMQ enqueue helper
│   │   │   └── modules/
│   │   │       ├── resume/        # POST /resume/ingest
│   │   │       ├── jobs/          # GET /jobs/matched/:userId
│   │   │       ├── apply/         # GET /apply/pending/:userId, POST /apply/:id
│   │   │       ├── agents/        # POST /agents/trigger
│   │   │       └── pipeline/      # GET /pipeline/summary/:userId
│   │   └── tsconfig.json          # CommonJS (NestJS requirement)
│   │
│   └── agent/                     # BullMQ Worker + Claude agents
│       ├── src/
│       │   ├── worker.ts          # BullMQ Worker, concurrency:4
│       │   └── agents/
│       │       ├── scout.agent.ts
│       │       ├── scorer.agent.ts
│       │       ├── tailor.agent.ts
│       │       ├── applier.agent.ts
│       │       ├── inbox.agent.ts
│       │       ├── scheduler.agent.ts
│       │       └── coach.agent.ts
│       └── knowledge/
│           └── skills/
│               └── ats_playbooks/ # workday.md, greenhouse.md, lever.md
│
├── packages/
│   ├── shared/                    # Zod schemas + TypeScript types
│   │   └── src/types.ts
│   ├── resume-engine/             # Parse + embed + score + tailor
│   │   └── src/
│   │       ├── parser.ts          # PDF + text parsing
│   │       ├── embedder.ts        # Two-step embedding (Haiku summary + vector)
│   │       ├── scorer.ts          # pgvector similarity + Claude re-rank
│   │       └── tailor.ts          # Sonnet tailoring + Haiku critique loop
│   ├── job-scraper/               # Playwright multi-board scraper
│   │   └── src/
│   │       ├── browser.ts         # Stealth browser factory
│   │       ├── index.ts           # scrapeJobs() — concurrent boards
│   │       └── scrapers/
│   │           ├── remoteok.ts    # JSON API scraper
│   │           └── wellfound.ts   # Playwright scraper
│   └── pipeline-tracker/          # Status transitions + Notion sync
│       └── src/
│           ├── supabase.ts        # recordTransition, getApplicationWithDetails
│           └── notion.ts          # syncToNotion, updateNotionStatus (stub)
│
├── supabase/
│   └── migrations/
│       └── 001_init.sql           # Full schema with pgvector + RLS + RPCs
│
├── docs/                          # This documentation
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

---

## Available Scripts

Run from the repo root:

```bash
pnpm dev          # Start web + api + agent worker in parallel (turbo)
pnpm build        # Build all packages and apps
pnpm lint         # ESLint all workspaces
pnpm typecheck    # tsc --noEmit all workspaces
pnpm test         # Run all tests (vitest)
```

Run per-workspace:

```bash
pnpm --filter @pitchfire/web dev
pnpm --filter @pitchfire/api dev
pnpm --filter @pitchfire/resume-engine build
```

---

## Adding a New Agent

1. Create `apps/agent/src/agents/<name>.agent.ts`:
   ```typescript
   export interface YourInput { ... }
   export interface YourResult { ... }
   export async function runYourAgent(input: YourInput): Promise<YourResult> { ... }
   ```

2. Add a job type to `packages/shared/src/types.ts`:
   ```typescript
   | { type: 'your-type'; your_field: string }
   ```

3. Wire it in `apps/agent/src/worker.ts`:
   ```typescript
   import { runYourAgent } from './agents/your.agent.js';
   // In switch:
   case 'your-type':
     return runYourAgent({ your_field: data.your_field });
   ```

4. Enqueue from the API:
   ```typescript
   await enqueueAgentJob({ type: 'your-type', your_field: '...' });
   ```

---

## Database Migrations

```bash
# Apply to local Supabase
pnpm supabase db push --local

# Generate TypeScript types from schema (updates packages/shared/src/database.types.ts)
pnpm supabase gen types typescript --local > packages/shared/src/database.types.ts

# Reset local DB (destructive)
pnpm supabase db reset --local
```

---

## Testing Strategy

### Unit Tests (vitest)
```bash
pnpm test
```
- `packages/resume-engine` — score two JD/resume pairs, assert score > 0.72
- `packages/job-scraper` — mock Playwright responses, assert parsed fields

### Manual Integration Test (Phase 2)
```bash
# 1. Upload a resume via the dashboard
curl -X POST http://localhost:3001/resume/ingest \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo-user-123","text":"Backend engineer with 6yr NestJS..."}'

# 2. Trigger scouting
curl -X POST http://localhost:3001/agents/trigger \
  -d '{"type":"scout","user_id":"demo-user-123","boards":["remoteok"]}'

# 3. Check pending review queue
curl http://localhost:3001/apply/pending/demo-user-123

# 4. Approve an application (replace <id>)
curl -X POST http://localhost:3001/apply/<id> \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}'
```

---

## TypeScript Notes

- `apps/api` uses `"module": "CommonJS"` — NestJS requirement (decorators + DI)
- `apps/agent` uses `"type": "module"` (ESM) with `.js` extensions in imports
- `packages/*` use `"moduleResolution": "NodeNext"` for ESM compatibility
- Never mix `import` styles across the NestJS boundary

---

## Playwright in CCR (Cloud)

Playwright is pre-installed at `/opt/pw-browsers/chromium`. No install needed:

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers   # already set in CCR
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1          # already set in CCR
```

The `ApplierAgent` auto-detects this path via `existsSync(PLAYWRIGHT_EXECUTABLE)`.
