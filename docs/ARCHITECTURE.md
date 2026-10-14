# Architecture — PitchFire

## System Overview

PitchFire is a TypeScript monorepo with three deployable apps and four shared packages, connected by a BullMQ job queue over Redis. All AI work runs through the Anthropic API using model-per-task routing.

```
User Browser
     │
     ▼
apps/web (Next.js 14, port 3000)
  ├── /dashboard    — resume upload, pipeline summary
  ├── /jobs         — matched jobs with similarity scores
  ├── /review       — approval queue (tailored resume + cover letter preview)
  ├── /applications — pipeline funnel view (all statuses)
  └── /sessions     — interview calendar + prep notes
     │
     │  REST API calls
     ▼
apps/api (NestJS, port 3001)
  ├── ResumeModule    — ingest PDF → embed → store
  ├── JobsModule      — matched jobs by pgvector similarity
  ├── ApplyModule     — approve/withdraw pending applications
  ├── AgentsModule    — trigger pipeline, enqueue BullMQ jobs
  └── PipelineModule  — status transitions + event log
     │
     │  BullMQ enqueue (Redis)
     ▼
apps/agent (BullMQ Worker, 3 queues)
  ├── ScoutAgent      — scrapes 10+ job boards (Playwright stealth)
  ├── ScorerAgent     — pgvector match + voyage-3-lite 1024-dim cosine
  ├── TailorAgent     — Claude Sonnet 4.6 + critique/revise loop → variant
  ├── ApplierAgent    — ATS detection → playbook → Playwright form-fill
  ├── InboxAgent      — Gmail tool-use loop → classify reply
  ├── SchedulerAgent  — Calendar event + Sonnet prep notes
  └── CoachAgent      — role Q&A + company context (final node)
```

---

## Agent Communication Flow

Agents communicate exclusively via BullMQ queues through `apps/agent/src/lib/agent-bus.ts`.
No direct function calls between agents; all handoffs are async queue messages.

```
User uploads resume
        │
        ▼ POST /agents/scout
  ScoutAgent  ──publishScore()──▶  ScorerAgent
        │                               │
  discovery-queue (c=6)        discovery-queue (c=6)
                                        │
                                  score ≥ 0.72?
                                        │ yes
                                  publishTailor()──▶  TailorAgent
                                                            │
                                                      apply-queue (c=2)
                                                            │
                                                    status: 'approved'
                                                    (awaits user review)
                                                            │
                                                 User approves in /review
                                                            │
                                              POST /apply/:id → publishApply()
                                                            │
                                                      ApplierAgent
                                                            │
                                                      apply-queue (c=2)
                                                            │
                                                  form filled + submitted
                                                            │
                                              publishInbox() [5-min delay]
                                                            │
                                                       InboxAgent
                                                            │
                                                    comms-queue (c=4)
                                                            │
                                              interview_invite detected?
                                                            │ yes
                                              publishSchedule(appId, threadId)
                                                            │
                                                   SchedulerAgent
                                                            │
                                                    comms-queue (c=4)
                                                            │
                                              calendar event + prep notes
                                                            │
                                                   publishCoach(sessionId)
                                                            │
                                                      CoachAgent
                                                    (final node — no publish)
```

**Approval gate**: TailorAgent deliberately does NOT publish to ApplierAgent.
The `/review` UI is the human-in-the-loop checkpoint. Only `POST /apply/:id` from
the API layer triggers `publishApply()` — after explicit user approval.

---

## Agent Descriptions

### ScoutAgent
- **Model**: Claude Haiku 5.5 (via `resume-engine` scrapeJobs)
- **Input**: `{ user_id, boards: string[], keywords? }`
- **Flow**: Playwright scrapes each board concurrently → embeds JD text (voyage-3-lite) → upserts `job_listings` → `publishScore(userId, resumeId)`
- **Boards**: RemoteOK (JSON API), Wellfound (Playwright)
- **On empty resume**: warns, no score job published

### ScorerAgent
- **Model**: `callWithRetry` wraps `scoreResumeAgainstJd` (Haiku + pgvector)
- **Input**: `{ user_id, resume_id }`
- **Flow**: Load resume → filter unseen jobs (bug fix: skip `.not()` filter when list empty) → score each → insert application row → `publishTailor(app.id)` for score ≥ 0.72
- **Threshold**: `MATCH_THRESHOLD = 0.72`

### TailorAgent
- **Model**: Claude Sonnet 4.6 (tailoring) + Haiku (critique + integrity check)
- **Input**: `{ application_id }`
- **Flow**: Load resume + JD → Sonnet generates variant + cover letter → Haiku critique loop (≤2 rounds) → integrity check → store variant → set `status: 'approved'`
- **Gate**: Does NOT publish downstream — waits for user approval in `/review`

### ApplierAgent
- **Model**: Claude Sonnet 4.6 (`MODELS.QUALITY`) via `callWithRetry`
- **Input**: `{ application_id }`
- **Flow**: Fetch user email from `users` table (not hardcoded) → detect ATS → load playbook → stealth Chromium → Claude DOM analysis → JSON actions array → execute → `publishInbox(userId)`
- **Security**: Email fetched from DB per user — no hardcoded PII

### InboxAgent
- **Model**: Claude Haiku 5.5 (`MODELS.FAST`) with `logTokens`
- **Input**: `{ user_id }`
- **Flow**: Gmail tool-use loop (5 rounds max) → classify threads → update `applications.status` → on `interview_invite`: `publishSchedule(applicationId, threadId)`

### SchedulerAgent
- **Model**: Haiku for extraction (`MODELS.FAST`), Sonnet for prep notes (`MODELS.QUALITY`)
- **Input**: `{ application_id, email_thread_id }`
- **Flow**: Extract interview details → confidence gate (< 0.8 → flag user) → Sonnet prep notes → Google Calendar event → insert `sessions` row → `publishCoach(session.id)`

### CoachAgent
- **Model**: Claude Sonnet 4.6 (`MODELS.QUALITY`) via `callWithRetry`
- **Input**: `{ session_id }`
- **Flow**: Load session + job + resume → company context bullets → role-specific Q&A (5–8 questions by session type) → persist enhanced prep notes to `sessions` table
- **Final node**: No downstream publish

---

## Shared Libraries (apps/agent/src/lib/)

| File | Purpose |
|---|---|
| `logger.ts` | Zero-dep structured JSON logger. `createLogger(agent)` → `{ info, warn, error, debug }`. stderr for warn/error, stdout for info/debug. |
| `models.ts` | `MODELS.FAST / MODELS.QUALITY` constants. `callWithRetry<T>()` with backoff on 429/500/529. `logTokens()` per-call cost visibility. |
| `agent-bus.ts` | BullMQ Queue producers. Lazy singleton IORedis connection. `closeAgentBus()` for graceful SIGTERM. |

---

## BullMQ Job Types

```typescript
type AgentJob =
  | { type: 'scout';    user_id: string; boards: string[] }
  | { type: 'score';    user_id: string; resume_id: string }
  | { type: 'tailor';   application_id: string }
  | { type: 'apply';    application_id: string }
  | { type: 'inbox';    user_id: string }
  | { type: 'schedule'; application_id: string; email_thread_id: string }
  | { type: 'coach';    session_id: string }
```

Worker configuration:
- **`discovery-queue`** — concurrency 6: `scout`, `score`
- **`apply-queue`** — concurrency 2: `tailor`, `apply`
- **`comms-queue`** — concurrency 4: `inbox`, `schedule`, `coach`
- **DLQ**: `pitchfire:dlq` Redis list — raw payload after 3rd attempt
- **Retry**: 3 attempts, exponential backoff (2s → 4s → 8s) per job
- **SIGTERM**: drains all workers + calls `closeAgentBus()` + disconnects Redis

---

## Database Schema

### Core Tables

```sql
users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  plan text DEFAULT 'free',
  stripe_customer_id text,
  created_at timestamptz
)

resumes (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  content_text text,
  embedding vector(1024),           -- voyage-3-lite 1024-dim
  variants jsonb,
  created_at timestamptz
)

job_listings (
  id uuid PRIMARY KEY,
  title text,
  company text,
  board text,
  url text UNIQUE,
  jd_text text,
  embedding vector(1024),           -- voyage-3-lite 1024-dim
  location text,
  scraped_at timestamptz
)

applications (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  job_id uuid REFERENCES job_listings(id),
  resume_id uuid REFERENCES resumes(id),
  status text DEFAULT 'discovered',
  match_score float,
  tailor_output jsonb,
  applied_at timestamptz,
  created_at timestamptz
)

pipeline_events (
  id uuid PRIMARY KEY,
  application_id uuid REFERENCES applications(id),
  event_type text,
  payload jsonb,
  created_at timestamptz
)

sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  application_id uuid REFERENCES applications(id),
  type text,
  scheduled_at timestamptz,
  duration_minutes int,
  google_calendar_event_id text,
  interviewer_names text[],
  prep_notes text,
  created_at timestamptz
)
```

### Application Status Machine

```
discovered
    │
    ▼ ScorerAgent (score ≥ 0.72)
pending_review
    │          │
    ▼ user     ▼ TailorAgent
  approved   withdrawn
    │
    ▼ ApplierAgent
  applying
    │          │
    ▼ success  ▼ failure
  applied    bounced
    │
    ▼ InboxAgent
  replied | rejected | offer | interview
    │
    ▼ SchedulerAgent (interview only)
  interview (session created)
```

### pgvector Index

```sql
CREATE INDEX ON resumes      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON job_listings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### match_jobs_for_resume RPC

```sql
CREATE OR REPLACE FUNCTION match_jobs_for_resume(
  query_embedding vector(1024),
  similarity_threshold float DEFAULT 0.72,
  match_count int DEFAULT 10
) RETURNS TABLE (id uuid, title text, company text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, title, company, 1 - (embedding <=> query_embedding) AS similarity
  FROM job_listings
  WHERE 1 - (embedding <=> query_embedding) > similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## ATS Knowledge Base

Stored in `apps/agent/knowledge/skills/ats_playbooks/`:

| File | Covers |
|---|---|
| `workday.md` | Multi-step wizard, `data-automation-id` selectors, Angular wait patterns |
| `greenhouse.md` | `#first_name`, `#email`, file upload, CAPTCHA detection |
| `lever.md` | Single-page form, `input[name="name"]`, iframe detection |
| `ashby.md` | (upcoming) |
| `generic.md` | (upcoming) |

---

## Embedding Strategy

PitchFire uses **voyage-3-lite** (1024-dim) for semantic embeddings:
- Resume text → 1024-dim dense vector stored in `resumes.embedding`
- JD text → 1024-dim dense vector stored in `job_listings.embedding`
- Cosine similarity via pgvector IVFFlat index → match score 0–1
- Threshold 0.72 → proceed to tailoring

**Cost**: $0.02/1M tokens. Semantically superior to deterministic encoding.

---

## Security & Anti-Detection

### Browser Automation
- `navigator.webdriver` overridden to `undefined`
- `navigator.plugins` spoofed to `[1, 2, 3]`
- Custom user agent: Chrome/120 on macOS
- Locale: `en-US`, Timezone: `America/New_York`
- Persistent session storage per user

### Row-Level Security
All Supabase tables have RLS enabled. Users read/write their own rows via `auth.uid() = user_id` policies.

### Data Isolation
- Each user gets an isolated browser profile directory
- `pipeline_tracker` validates application ownership before transitions
- User email fetched from DB per-request — no PII in source code
- No cross-tenant data exposure by design
