import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { AgentJob } from '@pitchfire/shared';
import { runScoutAgent } from './agents/scout.agent.js';
import { runScorerAgent } from './agents/scorer.agent.js';
import { runTailorAgent } from './agents/tailor.agent.js';
import { runInboxAgent } from './agents/inbox.agent.js';
import { runSchedulerAgent } from './agents/scheduler.agent.js';
import { runApplierAgent } from './agents/applier.agent.js';
import { runCoachAgent } from './agents/coach.agent.js';

// Phase 3: 3 typed queues prevent slow scout jobs from blocking apply/comms
// R&D finding: BullMQ v5 per-queue priority + separate concurrency settings
const QUEUES = {
  discovery: 'discovery-queue',   // scout + score  (concurrency: 6)
  apply:     'apply-queue',       // tailor + apply (concurrency: 2)
  comms:     'comms-queue',       // inbox + schedule (concurrency: 4)
} as const;

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,  // Upstash serverless: fail fast, don't buffer
});

// DLQ: on 3rd failure, raw payload → pitchfire:dlq Redis list
async function pushToDLQ(job: Job<AgentJob>): Promise<void> {
  try {
    await connection.lpush(
      'pitchfire:dlq',
      JSON.stringify({ job_id: job.id, data: job.data, failed_at: new Date().toISOString() }),
    );
  } catch (err) {
    console.error('[Worker] DLQ push failed:', (err as Error).message);
  }
}

function makeWorker(
  queueName: string,
  handler: (job: Job<AgentJob>) => Promise<unknown>,
  concurrency: number,
): Worker<AgentJob> {
  const w = new Worker<AgentJob>(queueName, handler, { connection, concurrency });

  w.on('completed', (job, result) => {
    console.log(`[${queueName}] ✓ ${job.data.type}`, result);
  });

  w.on('failed', async (job, err) => {
    console.error(`[${queueName}] ✗ ${job?.data.type}:`, err.message);
    if (job && job.attemptsMade >= 3) {
      await pushToDLQ(job);
    }
  });

  w.on('error', (err) => console.error(`[${queueName}] Error:`, err));

  return w;
}

// ─── Discovery worker (scout + score) ────────────────────────────────────────

makeWorker(
  QUEUES.discovery,
  async (job: Job<AgentJob>) => {
    const data = job.data;
    switch (data.type) {
      case 'scout': return runScoutAgent({ user_id: data.user_id, boards: data.boards });
      case 'score': return runScorerAgent({ user_id: data.user_id, resume_id: data.resume_id });
      default: return { skipped: true };
    }
  },
  6,
);

// ─── Apply worker (tailor + apply) ───────────────────────────────────────────

makeWorker(
  QUEUES.apply,
  async (job: Job<AgentJob>) => {
    const data = job.data;
    switch (data.type) {
      case 'tailor': return runTailorAgent({ application_id: data.application_id });
      case 'apply':  return runApplierAgent({ application_id: data.application_id });
      default: return { skipped: true };
    }
  },
  2,
);

// ─── Comms worker (inbox + schedule) ─────────────────────────────────────────

makeWorker(
  QUEUES.comms,
  async (job: Job<AgentJob>) => {
    const data = job.data;
    switch (data.type) {
      case 'inbox':    return runInboxAgent({ user_id: data.user_id });
      case 'schedule': return runSchedulerAgent({ application_id: data.application_id, email_thread_id: data.email_thread_id });
      case 'coach':    return runCoachAgent({ session_id: data.session_id });
      default: return { skipped: true };
    }
  },
  4,
);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received — closing workers');
  // Workers close gracefully; connection cleaned up by bullmq internals
  process.exit(0);
});

console.log('PitchFire Agent Workers started:');
console.log(`  ${QUEUES.discovery} (concurrency 6): scout, score`);
console.log(`  ${QUEUES.apply}     (concurrency 2): tailor, apply`);
console.log(`  ${QUEUES.comms}     (concurrency 4): inbox, schedule, coach`);
