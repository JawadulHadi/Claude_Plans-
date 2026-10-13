# Deployment Guide — PitchFire

## Deployment Stages

```
Stage 1: Local Docker      → $0/mo  — development only
Stage 2: Cloud Free Tier   → $0/mo  — early beta, <100 users
Stage 3: First Revenue     → $50/mo — break-even at 2 Pro users
Stage 4: Scale             → $200+/mo — dedicated infra per component
```

---

## Stage 1: Local (Docker Compose)

Everything runs on your machine via `docker-compose up -d`.

```yaml
# docker-compose.yml provides:
# - supabase-db (PostgreSQL 15 + pgvector)
# - supabase-studio (http://localhost:54323)
# - redis (BullMQ backend)
# - redis-ui (http://localhost:8081)
```

```bash
docker-compose up -d
pnpm dev
```

---

## Stage 2: Cloud Free Tier

| Service | Hosts | Free Limits |
|---|---|---|
| **Vercel** | `apps/web` | 100GB bandwidth, hobby projects |
| **Railway** | `apps/api` + `apps/agent` worker | 500h compute/mo |
| **Supabase** | PostgreSQL + pgvector + Auth | 500MB DB, 1GB storage, 50k auth users |
| **Upstash** | Redis (BullMQ) | 10k commands/day |

**Total cost: $0/mo** until meaningful traffic.

### Deploy Web (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from apps/web
cd apps/web
vercel --prod

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_API_URL=https://your-api.railway.app
```

Or connect GitHub repo to Vercel for automatic deploys on push to `main`.

### Deploy API + Agent (Railway)

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login

# Deploy API service
cd apps/api
railway up --service api

# Deploy Agent worker service
cd apps/agent
railway up --service agent-worker
```

Railway environment variables to set:
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://default:...@your-upstash-url:6379
```

### Supabase Cloud

1. Create project at supabase.com
2. Run migration: `npx supabase db push --db-url postgresql://...`
3. Enable pgvector: already in `001_init.sql`
4. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` from project settings

### Upstash Redis

1. Create database at upstash.com (free tier)
2. Copy Redis URL: `redis://default:PASSWORD@ENDPOINT:PORT`
3. Set as `REDIS_URL` in Railway + local `.env.local`

---

## Stage 3: First Revenue (~$50/mo)

| Service | Plan | Cost |
|---|---|---|
| Railway Starter | 5 GB RAM, always-on | $5/mo |
| Supabase Pro | 8 GB DB, daily backups | $25/mo |
| Vercel Pro | 1 TB bandwidth, faster builds | $20/mo |
| Upstash | still free (200k cmd/day) | $0/mo |
| **Total** | | **$50/mo** |

**Break-even**: 2 Pro users × $29/mo = $58/mo → profitable from day 1.

---

## Stage 4: Scale

| Component | Upgrade path |
|---|---|
| Database | Supabase → AWS RDS Aurora PostgreSQL (pgvector supported) |
| API | Railway → AWS ECS Fargate (containerized NestJS) |
| Agent Worker | Railway → multiple worker pods (parallel apply jobs) |
| Web | Vercel → stays on Vercel (already scales) |
| Redis | Upstash → Upstash Pro or Redis Cloud |

---

## Environment Variables Reference

### `apps/web` (Next.js — Vercel)

```bash
NEXT_PUBLIC_API_URL=https://api.pitchfire.com
```

### `apps/api` (NestJS — Railway)

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
REDIS_URL=redis://default:...@endpoint:6379
PORT=3001
```

### `apps/agent` (Worker — Railway)

```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
REDIS_URL=redis://default:...@endpoint:6379
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# User profile (Phase 5: from Supabase users table)
USER_FIRST_NAME=Jawad
USER_LAST_NAME=Ul Hadi
USER_EMAIL=jawadulhadicc@gmail.com
USER_PHONE=+1...
USER_LOCATION=Remote
USER_LINKEDIN=https://linkedin.com/in/...
# Optional connectors
NOTION_DATABASE_ID=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

---

## Docker Build (Production)

Each app has its own Dockerfile (to be added in Phase 4). For now, Railway auto-detects Node.js projects via `package.json`.

Recommended `railway.json` per service:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm --filter @pitchfire/api start:prod",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## CI/CD (GitHub Actions — Phase 4)

Planned workflow:

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
  deploy:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Railway deploy action
```

---

## Health Checks

| Endpoint | Expected |
|---|---|
| `GET /` (api) | `{ status: "ok" }` |
| `GET /api` (Swagger) | Swagger UI HTML |
| `GET /pipeline/summary/demo-user-123` | `{ discovered: N, ... }` |
| Redis BullMQ queue depth | `< 100` (no backlog) |
| Supabase Studio | `http://localhost:54323` (local) |
