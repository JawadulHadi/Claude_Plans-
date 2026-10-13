import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { AgentJob } from '@pitchfire/shared';
import { runScoutAgent } from './agents/scout.agent.js';
import { runScorerAgent } from './agents/scorer.agent.js';
import { runTailorAgent } from './agents/tailor.agent.js';
import { runInboxAgent } from './agents/inbox.agent.js';
import { runApplierAgent } from './agents/applier.agent.js';

const QUEUE_NAME = 'agent-jobs';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * PitchFire Agent Worker
 *
 * Implements the conveyor belt parallelism from kedster/jobautopilot-claude:
 * - Scout + Score + Inbox run concurrently
 * - BullMQ handles retries (3 attempts, exponential backoff)
 * - Model fallback chain handled per-agent (haiku/sonnet/opus)
 */
const worker = new Worker<AgentJob>(
  QUEUE_NAME,
  async (job: Job<AgentJob>) => {
    const data = job.data;
    console.log(`[Worker] Processing job: ${data.type}`, data);

    switch (data.type) {
      case 'scout':
        return runScoutAgent({ user_id: data.user_id, boards: data.boards });

      case 'score':
        return runScorerAgent({ user_id: data.user_id, resume_id: data.resume_id });

      case 'tailor':
        return runTailorAgent({ application_id: data.application_id });

      case 'inbox':
        return runInboxAgent({ user_id: data.user_id });

      case 'apply':
        return runApplierAgent({ application_id: data.application_id });

      case 'schedule':
        console.log('[Worker] SchedulerAgent not yet implemented — Phase 3');
        return { skipped: true };

      default:
        console.warn('[Worker] Unknown job type:', (data as any).type);
        return { skipped: true };
    }
  },
  {
    connection,
    concurrency: 4,  // Run up to 4 agent jobs concurrently
  },
);

worker.on('completed', (job, result) => {
  console.log(`[Worker] ✓ ${job.data.type} completed`, result);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] ✗ ${job?.data.type} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker] Error:', err);
});

console.log('PitchFire Agent Worker started. Listening for jobs on queue:', QUEUE_NAME);
console.log('Concurrency: 4 (scout + score + tailor + inbox can run in parallel)');
