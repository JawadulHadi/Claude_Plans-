# Applymatic — Autonomous AI Job Search Orchestrator

> Upload your resume once. Applymatic discovers matched jobs, tailors every application, submits autonomously, tracks replies, and books your interviews — all while you focus on the work that matters.

[![Phase](https://img.shields.io/badge/Phase-2%20Complete-blue)](#roadmap)
[![Stack](https://img.shields.io/badge/Stack-NestJS%20%7C%20Next.js%20%7C%20Supabase%20%7C%20Claude-blueviolet)](#tech-stack)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## What Makes Applymatic Different

Most job tools are search wrappers. Applymatic is a **multi-agent Claude orchestrator** where each agent owns a domain, communicates via a BullMQ job queue, and plugs into your existing stack (Gmail, Google Calendar, Notion, Slack) via MCP connectors — not third-party integrations bolted on later.

| Feature | Others | Applymatic |
|---|---|---|
| Job discovery | Manual or alerts | 10+ boards, continuous |
| Resume matching | Keyword filter | pgvector semantic similarity |
| Resume tailoring | Manual | Claude Sonnet per application |
| Application | Manual | Autonomous Playwright form-fill |
| Reply tracking | Check your inbox | Gmail MCP, auto-classify |
| Interview booking | Manual | Google Calendar MCP, auto-create |
| Pipeline view | Spreadsheet | Supabase + Notion sync |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Applymatic Platform                          │
│                                                                 │
│  apps/web (Next.js 14)   apps/api (NestJS)   apps/agent        │
│  ├── /dashboard          ├── /resume         ├── ScoutAgent    │
│  ├── /jobs               ├── /jobs           ├── ScorerAgent   │
│  ├── /review  ◄──────────├── /apply ─────────├── TailorAgent  │
│  ├── /applications       ├── /pipeline       ├── ApplierAgent  │
│  └── /sessions           └── /agents         ├── InboxAgent   │
│                                               └── SchedulerAgent│
│                                                                 │
│  packages/                                                      │
│  ├── resume-engine    (parse + embed + score + tailor)          │
│  ├── job-scraper      (Playwright multi-board)                  │
│  ├── pipeline-tracker (Supabase transitions + Notion sync)      │
│  └── shared           (Zod schemas + TypeScript types)          │
│                                                                 │
│  Infrastructure: Supabase (PostgreSQL + pgvector) + Redis       │
└─────────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full agent data-flow diagram.

---

## Quick Start

### Prerequisites
- Node.js ≥ 22, pnpm ≥ 10
- Docker (for local Supabase + Redis)
- An Anthropic API key

```bash
# 1. Clone and install
git clone https://github.com/JawadulHadi/Applymatic.git
cd Applymatic
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, SUPABASE_*, REDIS_URL

# 3. Start local infrastructure
docker-compose up -d

# 4. Apply database migrations
npx supabase db push

# 5. Start all services (web + api + agent worker)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Full setup guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 App Router + Tailwind | SSR, dark theme, free on Vercel |
| Backend API | NestJS + TypeScript | Decorators, modules, DI — matches existing expertise |
| AI Engine | Claude Sonnet 4.6 / Haiku 5.5 | Model-per-task routing: fast for scoring, powerful for tailoring |
| Database | Supabase (PostgreSQL + pgvector) | Vector similarity search built-in |
| Queue | BullMQ + Redis | Async agent jobs, exponential backoff retry |
| Browser | Playwright (pre-installed) | Stealth headless form fill |
| Email | Gmail MCP | Native connector, no OAuth boilerplate |
| Calendar | Google Calendar MCP | Auto-book interviews |
| Tracking | Supabase + Notion MCP | DB for queries, Notion for human pipeline view |
| Notifications | Slack MCP | Key event push |
| Monorepo | pnpm workspaces + Turborepo | Fast, parallel builds |

---

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| **1** | Scout + Score + Dashboard | ✅ Complete |
| **2** | Apply Automation (TailorAgent + ApplierAgent + Review Queue) | ✅ Complete |
| **3** | Communication Layer (InboxAgent + SchedulerAgent) | 🔜 Next |
| **4** | Intelligence & Polish (Analytics + CoachAgent + Slack) | 🔜 Planned |
| **5** | SaaS Layer (Stripe + Multi-tenant + Agency mode) | 🔜 Planned |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## Pricing (Phase 5)

| Plan | Price | Limits |
|---|---|---|
| Free | $0/mo | 10 applications/mo, 3 boards |
| **Pro** | **$29/mo** | Unlimited, 15+ boards, AI tailoring, interview prep |
| Agency | $99/mo | 10 user profiles, white-label, bulk apply |

Break-even: **2 Pro subscribers = $58/mo**, profitable from user #2 at ~$50/mo infra.

---

## Documentation

| Document | Description |
|---|---|
| [PLAN.md](docs/PLAN.md) | Original product plan — context, architecture decisions, reference patterns |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Agent data flow, DB schema, system diagram |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, env vars, workspace scripts, testing |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cloud deployment guide: Vercel + Railway + Supabase + Upstash |
| [API.md](docs/API.md) | REST API endpoint reference |
| [ROADMAP.md](docs/ROADMAP.md) | Phase-by-phase feature plan with deliverables |

---

## Contributing

Built by [Jawad Ul Hadi](https://github.com/JawadulHadi) — Backend Lead / AI Systems Architect.

The architecture, agent design patterns, and "Designing for AI Failure" approach documented here are available as a case study. See `docs/PLAN.md` for the full design rationale.
