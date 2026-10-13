# PitchFire — R&D Findings & Technical Decisions

> Deep-dive research conducted before Phase 3. All findings fed directly into implementation decisions.
> Each section: what we found → what we changed → why it matters.

---

## Executive Summary

Before building the Communication Layer (Phase 3), five technical risks were identified and investigated:

| # | Area | Risk | Decision | Outcome |
|---|---|---|---|---|
| 1 | Embeddings | Fake deterministic embedder making pgvector scores meaningless | Replace with `voyage-3-lite` (1024-dim) | ✅ Applied Phase 3 |
| 2 | Gmail integration | No real tool-use loop — just a stub | Full 5-round Claude tool-use loop | ✅ Applied Phase 3 |
| 3 | BullMQ queue design | Single queue blocking apply/comms behind slow scout jobs | Split into 3 typed queues | ✅ Applied Phase 3 |
| 4 | Browser fingerprinting | `navigator.plugins` integer array is a known bot signature | Return real Chrome `Plugin` objects | ✅ Applied Phase 3 |
| 5 | Queue observability | No visibility into queue health or failed jobs | DLQ (done) + Bull Board UI (Phase 4) | ⏳ Partial |

---

## Area 1 — Embeddings (Critical)

### Problem
`packages/resume-engine/src/embedder.ts` used a deterministic sin/cos function:

```typescript
// Old (meaningless):
const embedding = Array.from({ length: 1536 }, (_, i) =>
  Math.sin(i * 0.01) * Math.cos(i / 100)
);
```

The resulting vectors had no semantic relationship to the input text. Two completely unrelated resumes would produce similar cosine similarity scores. Every `pgvector` similarity result in the system was statistically random.

### Research
- Anthropic's `/messages` endpoint does not expose an embedding API — only text generation
- OpenAI `text-embedding-ada-002` ($0.10/M tokens) is the obvious alternative but over-priced for this use case
- **Voyage AI `voyage-3-lite`** — purpose-built for retrieval, 1024-dim, $0.02/M tokens, npm SDK available
- Cohere `embed-v3` and Google `text-embedding-004` considered; both require more setup overhead

### Decision
Use `voyage-3-lite` via the `voyageai` npm package. Falls back to a 1024-dim stub when `VOYAGE_API_KEY` is not set so local dev/CI never crashes.

```typescript
// New (semantically valid):
const result = await voyage.embed({ input: [text], model: 'voyage-3-lite' });
const embedding = result.data?.[0]?.embedding; // 1024-dim real vectors
```

### DB Impact
The existing IVFFlat index was built for 1536-dim vectors — wrong size for voyage-3-lite.
Migration `002_voyage_embeddings.sql` drops and recreates both columns and indexes at 1024-dim.

### Why It Matters
Without this fix, the job matching core loop (scout → score → filter) produces random rankings. This is the highest-impact single fix in the entire codebase.

---

## Area 2 — Gmail Integration (InboxAgent)

### Problem
`inbox.agent.ts` was a stub that logged `"Gmail MCP integration ready for Phase 3"` and returned immediately.

### Research
**Claude tool-use pattern for Gmail:**
- Claude SDK supports `messages.create` with `tools` parameter
- Gmail REST API (v1) provides `threads.list` and `threads.get` without requiring the Gmail MCP server
- The tool-use loop terminates when `stop_reason === 'end_turn'` — Claude signals it has finished
- Haiku is sufficient for email classification (~$0.001/email); Sonnet is overkill here

**Cost model:**
- Haiku input: $0.80/M tokens; output: $4/M tokens
- Average email thread: ~800 input tokens + ~50 output tokens
- ≈ $0.00064 + $0.0002 = **~$0.001/email classified**

**Risk: infinite loop** — if tool-use loop never terminates, costs spiral. Cap at 5 rounds.

### Decision
5-round maximum tool-use loop. Claude drives `gmail_search_threads → gmail_get_thread` calls. After loop, parse `email_classifications` from the final `end_turn` response. Haiku classifies each thread as `interview_invite | rejection | offer | followup | other`.

```
Round 1: Claude calls gmail_search_threads("from:hiring subject:interview is:unread")
Round 2: Claude calls gmail_get_thread(threadId_1)
Round 3: Claude calls gmail_get_thread(threadId_2)
Round 4: end_turn → returns { email_classifications: [...] }
```

### Fuzzy Domain Matching
Gmail senders use personal email addresses, not company domains. To match `hr@acme.com` to an application for `Acme Corp`, extract the domain suffix and do case-insensitive substring matching against `job_listings.company`. Works for ~80% of cases; remaining 20% fall back to `other` classification.

---

## Area 3 — NestJS + BullMQ Queue Architecture

### Problem
All agent jobs used a single queue `agent-jobs` with concurrency 4. A slow ScoutAgent (Playwright, 60+ seconds per board) would occupy all 4 slots, blocking time-sensitive InboxAgent and SchedulerAgent jobs.

### Research
**Queue segmentation patterns:**
- Separate queues by job latency profile, not by agent type
- Scout/score jobs: high volume, slow (network I/O, Playwright)
- Tailor/apply jobs: low volume, slow (LLM generation + Playwright)
- Inbox/schedule jobs: moderate volume, fast-ish (API calls, no browser)

**Concurrency tuning:**
- `discovery-queue` (c=6): jobs are I/O-bound, can saturate CPU without issue
- `apply-queue` (c=2): each job runs a headless browser — RAM constraint (each Chromium instance ~250MB)
- `comms-queue` (c=4): API calls, safe to run in parallel

**Dead Letter Queue pattern:**
On 3rd failure, push raw job payload to a Redis list `pitchfire:dlq`. This enables:
- Manual replay without losing the payload
- Monitoring/alerting (list length = backlog health signal)
- Root cause investigation before retry

### Decision
Three workers, one per queue. Queue routing in `apps/api/src/common/queue.ts` via `JOB_TO_QUEUE` map. `enableOfflineQueue: false` on IORedis (correct for Upstash serverless — fail fast, no buffering).

```
discovery-queue (c=6)  → scout, score
apply-queue (c=2)      → tailor, apply
comms-queue (c=4)      → inbox, schedule
pitchfire:dlq          → failed jobs after 3 attempts
```

---

## Area 4 — Browser Fingerprinting (Anti-Bot)

### Problem
The Playwright stealth context was setting:

```javascript
// Old (bot signature):
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
```

An array of integers is impossible in a real browser — `navigator.plugins` is a `PluginArray` where each element is a `Plugin` object. Multiple bot-detection libraries (FingerprintJS, Datadome, Cloudflare Turnstile) check for this exact signature.

### Research
**Real Chrome plugins on a typical install:**

| Name | Filename | Description |
|---|---|---|
| Chrome PDF Plugin | `internal-pdf-viewer` | Portable Document Format |
| Chrome PDF Viewer | `mhjfbmdgcfjbbpaeojofohoefgiehjai` | _(empty)_ |
| Native Client | `internal-nacl-plugin` | _(empty)_ |

**Other bot signals in our setup:**
- `navigator.webdriver === true` → already fixed (set to `undefined`)
- TLS JA3 fingerprint on LinkedIn → not fixable via Playwright; use LinkedIn Jobs API instead (Phase 4)
- Cloudflare Turnstile on Indeed → not bypassable; use Indeed Publisher API instead (Phase 4)
- WebGL renderer string → still leaking default headless value (Phase 4 backlog)

### Decision
Return 3 real Plugin objects matching Chrome defaults. Reduces bot-detection hit rate on Wellfound and RemoteOK.

---

## Area 5 — Queue Observability

### Problem
No visibility into queue depth, job throughput, failure rates, or DLQ length. Operational blind spot for production.

### Research
**`@bull-board/express`** — official Bull/BullMQ admin UI:
- Mounts as Express middleware at any path (e.g. `/admin/queues`)
- Shows queue stats: active, waiting, completed, failed per queue
- Allows manual job retry from the UI
- Auth: must add your own middleware (no built-in auth)

**Pattern:** Guard with a simple `ADMIN_TOKEN` header check middleware — fast to implement, sufficient for a single-operator system.

### Decision
- **Phase 3 done:** DLQ push on 3rd failure (raw payload to `pitchfire:dlq` Redis list)
- **Phase 4:** Add `@bull-board/express` at `/admin/queues` behind `ADMIN_TOKEN` header

---

## Broader Architectural Notes

### Model Routing Strategy
| Task | Model | Reason |
|---|---|---|
| Embedding generation | Voyage AI (not Claude) | Claude has no embedding API |
| Job matching / scoring | `claude-haiku-5-5` | Fast, cheap, sufficient for similarity re-ranking |
| Email classification | `claude-haiku-5-5` | ~$0.001/email; classification is simple |
| Interview detail extraction | `claude-haiku-5-5` | Structured JSON extraction, low complexity |
| Resume tailoring | `claude-sonnet-4-6` | Quality-critical; user sees the output |
| Cover letter generation | `claude-sonnet-4-6` | Quality-critical |
| Interview prep notes | `claude-sonnet-4-6` | Quality-critical; personalised per role |
| ATS form navigation | `claude-sonnet-4-6` | Multi-step browser reasoning |

### Cost Estimate (per active user per week)
- 50 jobs scouted: ~$0.01 (Haiku scoring)
- 10 resumes tailored: ~$0.80 (Sonnet generation)
- 30 emails classified: ~$0.03 (Haiku)
- 2 interview schedules + prep notes: ~$0.20 (Sonnet)
- Voyage embeddings (initial): ~$0.001
- **Total: ~$1.04/user/week** — comfortable margin against $29/mo Pro plan

---

## Phase 4 Backlog (from this R&D)

| Item | Priority | Effort |
|---|---|---|
| LinkedIn Jobs API (replace Playwright scraping) | High | Medium |
| Indeed Publisher API (replace Cloudflare-blocked scraper) | High | Medium |
| `@bull-board/express` admin UI | Medium | Low |
| Score-gated critique loop (`while score < 0.8 && round < 3`) | Medium | Low |
| WebGL renderer string fix | Low | Low |

---

*Last updated: 2025-10-13 · Based on research conducted before Phase 3 implementation*
