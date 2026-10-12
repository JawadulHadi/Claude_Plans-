# Architecture — Applymatic

## System Overview

Applymatic is a TypeScript monorepo with three deployable apps and four shared packages, connected by a BullMQ job queue over Redis. All AI work runs through the Anthropic API using model-per-task routing.

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
apps/agent (BullMQ Worker, concurrency: 4)
  ├── ScoutAgent      — scrapes 10+ job boards (Playwright stealth)
  ├── ScorerAgent     — pgvector match + Claude Haiku 5.5 re-rank
  ├── TailorAgent     — Claude Sonnet 4.6 + critique/revise loop → variant
  ├── ApplierAgent    — ATS detection → playbook → Playwright form-fill
  ├── InboxAgent      — Gmail MCP polling → classify reply
  └── SchedulerAgent  — Google Calendar MCP → interview event + prep
```

---

## Agent Descriptions

### ScoutAgent
- **Model**: Claude Haiku 5.5 (cheap, fast filtering)
- **Input**: `{ user_id, boards: string[] }`
- **Flow**: Playwright scrapes each board concurrently → upserts `job_listings` → enqueues `score` job
- **Boards**: RemoteOK (JSON API), Wellfound (Playwright), LinkedIn (future), Indeed (future)

### ScorerAgent
- **Model**: Claude Haiku 5.5 + pgvector cosine similarity
- **Input**: `{ user_id, resume_id }`
- **Flow**: Loads user resume embedding → calls `match_jobs_for_resume()` Supabase RPC (ivfflat cosine, top 10) → Claude re-ranks with faithfulness self-eval (3 retries) → updates `applications.score` → enqueues `tailor` for score > 0.72
- **Threshold**: 0.72 similarity to proceed to tailoring

### TailorAgent
- **Model**: Claude Sonnet 4.6 (tailoring) + Claude Haiku 5.5 (critique + integrity check)
- **Input**: `{ application_id }`
- **Flow**:
  1. Load resume + JD from Supabase
  2. Sonnet generates tailored resume variant + cover letter
  3. Haiku critique loop (≤2 rounds): checks relevance, tone, keyword density
  4. Haiku integrity check: verifies no fabricated employers or skills
  5. If integrity fails → mark `bounced`
  6. Otherwise → store variant in `applications.tailor_output` → set status `pending_review`

### ApplierAgent
- **Model**: Claude Sonnet 4.6 (DOM analysis + action generation)
- **Input**: `{ application_id }`
- **Flow**:
  1. Load application details from `pipeline-tracker`
  2. Detect ATS from job URL (workday / greenhouse / lever / ashby / generic)
  3. Load ATS playbook markdown from `knowledge/skills/ats_playbooks/`
  4. `recordTransition('approved' → 'applying')`
  5. Launch stealth Chromium (persistent profile at `~/.jobpilot/browser_profiles/{userId}`)
  6. Navigate to job URL, upload resume file
  7. Claude analyzes `document.body.innerHTML` + playbook → returns JSON actions array
  8. Execute: `fill`, `click`, `select`, `wait` actions
  9. `storeAppliedConfirmation(url, text)` → status `applied`
  10. On any error → `recordTransition('applying' → 'bounced')`

### InboxAgent (Phase 3)
- **Model**: Claude Haiku 5.5
- **Input**: `{ user_id }`
- **Flow**: Gmail MCP search for job-related threads → classify each as `interview` / `reject` / `ghosted` / `offer` → update application status → enqueue `schedule` if interview

### SchedulerAgent (Phase 3)
- **Model**: Claude Sonnet 4.6
- **Input**: `{ application_id, email_thread_id }`
- **Flow**: Extract interview time from thread → Google Calendar MCP create event → Claude generates prep notes (company research + role-specific Q&A) → store in `sessions` table

---

## BullMQ Job Types

```typescript
type AgentJob =
  | { type: 'scout';   user_id: string; boards: string[] }
  | { type: 'score';   user_id: string; resume_id: string }
  | { type: 'tailor';  application_id: string }
  | { type: 'apply';   application_id: string }
  | { type: 'inbox';   user_id: string }
  | { type: 'schedule'; application_id: string };
```

Worker configuration:
- **Concurrency**: 4 (scout + score + inbox can run concurrently)
- **Retry**: 3 attempts with exponential backoff
- **Queue name**: `agent-jobs`

---

## Database Schema

### Core Tables

```sql
-- Users
users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  plan text DEFAULT 'free',         -- free | pro | agency
  stripe_customer_id text,
  created_at timestamptz
)

-- Resumes with pgvector embedding
resumes (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  content_text text,
  embedding vector(1536),           -- Anthropic embedding (semantic summary)
  variants jsonb,                   -- array of { tailored_resume, cover_letter, score }
  created_at timestamptz
)

-- Job listings with pgvector embedding
job_listings (
  id uuid PRIMARY KEY,
  title text,
  company text,
  board text,                       -- remoteok | wellfound | linkedin | ...
  url text UNIQUE,
  jd_text text,
  embedding vector(1536),
  location text,
  scraped_at timestamptz
)

-- Applications (the pipeline)
applications (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  job_id uuid REFERENCES job_listings(id),
  resume_id uuid REFERENCES resumes(id),
  status text DEFAULT 'discovered', -- see status machine below
  score float,                      -- similarity 0-1
  tailor_output jsonb,              -- { tailored_resume, cover_letter, score }
  applied_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz
)

-- Event log for every status transition
pipeline_events (
  id uuid PRIMARY KEY,
  application_id uuid REFERENCES applications(id),
  event_type text,
  from_status text,
  to_status text,
  source text,                      -- agent | user | system
  payload jsonb,
  created_at timestamptz
)

-- Interview sessions
sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  application_id uuid REFERENCES applications(id),
  type text,                        -- interview | followup | offer
  scheduled_at timestamptz,
  prep_notes text,
  created_at timestamptz
)
```

### Application Status Machine

```
discovered
    │
    ▼ ScorerAgent (score > 0.72)
scored
    │
    ▼ TailorAgent (variant generated)
pending_review
    │          │
    ▼ user     ▼ user
  approved   withdrawn
    │
    ▼ ApplierAgent
  applying
    │          │
    ▼ success  ▼ failure
  applied    bounced
    │
    ▼ InboxAgent
  replied / ghosted / interview_scheduled
```

### pgvector Index

```sql
CREATE INDEX ON resumes  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON job_listings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### match_jobs_for_resume RPC

```sql
CREATE OR REPLACE FUNCTION match_jobs_for_resume(
  query_embedding vector(1536),
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

Claude Sonnet receives the playbook as context alongside the live page HTML, then returns a JSON actions array. This handles per-company form variations gracefully without hard-coded selectors.

---

## Embedding Strategy

Applymatic uses a two-step embedding approach (upgradeable to Voyage-3):

1. **Claude Haiku** generates a semantic summary (key skills, experience, domain)
2. **Deterministic 1536-dim vector** derived from the summary text (sin/cos encoding, L2-normalized)

This avoids the need for a separate embedding API while producing semantically meaningful vectors for pgvector similarity search.

**Production upgrade path**: Replace step 2 with `voyage-3` or `text-embedding-3-small` for true dense embeddings.

---

## Security & Anti-Detection

### Browser Automation
- `navigator.webdriver` overridden to `undefined`
- `navigator.plugins` spoofed to `[1, 2, 3]`
- Custom user agent: Chrome/120 on macOS
- Locale: `en-US`, Timezone: `America/New_York`
- Persistent session storage per user (cookies, localStorage)

### Row-Level Security
All Supabase tables have RLS enabled. Users can only read/write their own rows via `auth.uid() = user_id` policies.

### Data Isolation
- Each user gets an isolated browser profile directory
- `pipeline_tracker` validates application ownership before transitions
- No cross-tenant data exposure by design
