# PitchFire — Autonomous AI Job Search Orchestrator

> Upload your resume once. PitchFire discovers matched jobs, tailors every application, submits autonomously, tracks replies, and books your interviews — all while you focus on the work that matters.

[![Phase](https://img.shields.io/badge/Phase-3%20Complete-blue)](#roadmap)
[![Stack](https://img.shields.io/badge/Stack-NestJS%20%7C%20Next.js%20%7C%20Claude%20SDK%20%7C%20BullMQ-blueviolet)](#tech-stack)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Security](https://img.shields.io/badge/Security-Policy-red)](SECURITY.md)
[![Changelog](https://img.shields.io/badge/Changelog-v0.4.0-orange)](CHANGELOG.md)

---

## What Makes PitchFire Different

Most job tools are search wrappers. PitchFire is a **multi-agent Claude orchestrator** where each agent owns a domain, communicates via a BullMQ job queue, and plugs into your existing stack (Gmail, Google Calendar, Notion, Slack) — not third-party integrations bolted on later.

| Feature | Others | PitchFire |
|---|---|---|
| Job discovery | Manual or alerts | 10+ boards, continuous, Playwright stealth |
| Resume matching | Keyword filter | voyage-3-lite 1024-dim pgvector cosine similarity |
| Resume tailoring | Manual | Claude Sonnet 4.6 + 2-round critique loop |
| Application | Manual | Autonomous Playwright ATS form-fill + user approval gate |
| Reply tracking | Check your inbox | Gmail tool-use loop, Haiku classifier, auto-update pipeline |
| Interview booking | Manual | Google Calendar REST API, confidence gate, Sonnet prep notes |
| Failure handling | Silent | DLQ on 3rd failure, confidence gates, integrity checks |

**Designing for AI Failure** is the core thesis: every autonomous action has a fallback (confidence < 0.8 → user flag), an approval gate (every application reviewed before submit), and a recovery path (DLQ replay). See [docs/RND.md](docs/RND.md) for the full reasoning.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PitchFire Platform                         │
│                                                                     │
│   apps/web (Next.js 14)    apps/api (NestJS)    apps/agent          │
│   ├── /dashboard           ├── /resume          ├── ScoutAgent      │
│   ├── /jobs                ├── /jobs            ├── ScorerAgent     │
│   ├── /review ◄────────────├── /apply ──────────├── TailorAgent    │
│   ├── /applications        ├── /pipeline        ├── ApplierAgent   │
│   └── /sessions            ├── /sessions        ├── InboxAgent     │
│                            └── /agents          └── SchedulerAgent  │
│                                                                     │
│   packages/                                                         │
│   ├── resume-engine    (parse · voyage-3-lite embed · tailor)       │
│   ├── job-scraper      (Playwright stealth · RemoteOK · Wellfound)  │
│   ├── pipeline-tracker (Supabase transitions · Notion sync stub)    │
│   └── shared           (Zod schemas · AgentJob discriminated union) │
│                                                                     │
│   Queues (BullMQ + Redis):                                          │
│   ├── discovery-queue (c=6)  → scout, score                        │
│   ├── apply-queue (c=2)      → tailor, apply                       │
│   ├── comms-queue (c=4)      → inbox, schedule                     │
│   └── pitchfire:dlq          → failed jobs after 3 attempts        │
│                                                                     │
│   Data: Supabase (PostgreSQL + pgvector 1024-dim) + Redis           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 22, pnpm ≥ 10
- Docker (local Supabase + Redis)
- An [Anthropic API key](https://console.anthropic.com)

```bash
# 1. Clone and install
git clone https://github.com/JawadulHadi/pitchfire.git
cd pitchfire
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
#           SUPABASE_SERVICE_ROLE_KEY, REDIS_URL
# Optional: VOYAGE_API_KEY (real embeddings), GMAIL_ACCESS_TOKEN,
#           GOOGLE_CALENDAR_ACCESS_TOKEN

# 3. Start local infrastructure
docker-compose up -d

# 4. Apply database migrations
npx supabase db push

# 5. Start all services (web + api + agent worker, parallel via Turborepo)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — Swagger UI at [http://localhost:3001/api](http://localhost:3001/api).

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 App Router + Tailwind + shadcn/ui | SSR, free on Vercel |
| Backend API | NestJS + TypeScript | Decorators, modules, DI |
| AI Engine | Claude Sonnet 4.6 / Haiku 5.5 | Model-per-task: Haiku for cheap classification, Sonnet for quality generation |
| Embeddings | Voyage AI `voyage-3-lite` (1024-dim) | $0.02/M tokens; semantically valid pgvector similarity |
| Database | Supabase (PostgreSQL + pgvector) | Vector similarity built-in, generous free tier |
| Queue | BullMQ + Redis (Upstash) | 3 typed queues, DLQ, SIGTERM drain |
| Browser | Playwright | Stealth headless ATS form-fill |
| Email | Gmail REST API | Claude tool-use loop for inbox monitoring |
| Calendar | Google Calendar REST API | Auto-book interview events + prep notes |
| Tracking | Supabase + Notion stub | DB for queries, Notion for human pipeline view |
| Monorepo | pnpm workspaces + Turborepo | Parallel builds, shared packages |

---

## Roadmap

| Phase | Goal | Status | PR |
|---|---|---|---|
| **1** | Foundation — Scout + Score + Dashboard | ✅ Complete | [#1](https://github.com/JawadulHadi/pitchfire/pull/1) |
| **2** | Apply Automation — Tailor + Playwright + Approval Gate | ✅ Complete | [#3](https://github.com/JawadulHadi/pitchfire/pull/3) |
| **3** | Communication Layer — InboxAgent + SchedulerAgent + 3 Queues | ✅ Complete | [#6](https://github.com/JawadulHadi/pitchfire/pull/6) |
| **4** | Intelligence & Polish — Analytics + CoachAgent + Bull Board | 🔜 Next | — |
| **5** | SaaS Layer — Stripe + Multi-tenant + Agency Mode | 🔜 Planned | — |

---

## Pricing (Phase 5)

| Plan | Price | Limits |
|---|---|---|
| Free | $0/mo | 10 applications/mo, 3 boards |
| **Pro** | **$29/mo** | Unlimited applications, 15+ boards, AI tailoring, interview prep |
| Agency | $99/mo | 10 user profiles, white-label, bulk apply |

Break-even: **2 Pro subscribers ($58/mo) > $50/mo infra**. Profitable from user #2.

---

## Documentation

| Document | Description |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Release notes — every change per version |
| [SECURITY.md](SECURITY.md) | Security policy, vulnerability reporting, credential guidance |
| [docs/RND.md](docs/RND.md) | **R&D findings** — what we researched, what we changed, why |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Phase-by-phase implementation report with commit SHAs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Agent data flow, DB schema, system design |
| [docs/API.md](docs/API.md) | REST API endpoint reference |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, env vars, workspace scripts, testing |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cloud deployment: Vercel + Railway + Supabase + Upstash |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase-by-phase feature plan with deliverables |

---

## Contributing

Built by [Jawad Ul Hadi](https://github.com/JawadulHadi) — Backend Lead / AI Systems Architect.

The "Designing for AI Failure" approach (confidence gates, approval gates, DLQ recovery) and the multi-agent Claude orchestration patterns documented here are available as a case study. See [docs/RND.md](docs/RND.md) for full reasoning and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.

---

## License

MIT — see [LICENSE](LICENSE).
