import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { AgentJob } from '@pitchfire/shared';
import { runScoutAgent } from './agents/scout.agent.js';
import { runScorerAgent } from './agents/scorer.agent.js';
import { runTailorAgent } from './agents/tailor.agent.js';
import { runInboxAgent } from './agents/inbox.agent.js';
import { runSchedulerAgent } from './agents/scheduler.agent.js';
import { runApplierAgent } from './agents/applier.agent.js';
import { runCoachAgent } from './agents/coach.agent.js';
import { closeAgentBus } from './lib/agent-bus.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('Worker');

const QUEUES = {
  discovery: 'discovery-queue',
  apply:     'apply-queue',
  comms:     'comms-queue',
} as const;

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

async function pushToDLQ(job: Job<AgentJob>): Promise<void> {
  try {
    await connection.lpush(
      'pitchfire:dlq',
      JSON.stringify({ job_id: job.id, data: job.data, failed_at: new Date().toISOString() }),
    );
  } catch (err) {
    log.error('DLQ push failed', { error: (err as Error).message });
  }
}

const workers: Worker<AgentJob>[] = [];

function makeWorker(
  queueName: string,
  handler: (job: Job<AgentJob>) => Promise<unknown>,
  concurrency: number,
): Worker<AgentJob> {
  const w = new Worker<AgentJob>(queueName, handler, { connection, concurrency });

  w.on('completed', (job, result) => {
    log.info('Job completed', { queue: queueName, type: job.data.type, result });
  });

  w.on('failed', async (job, err) => {
    log.error('Job failed', { queue: queueName, type: job?.data.type, error: err.message });
    if (job && job.attemptsMade >= 3) {
      await pushToDLQ(job);
    }
  });

  w.on('error', (err) => log.error('Worker error', { queue: queueName, error: err.message }));

  workers.push(w);
  return w;
}

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

process.on('SIGTERM', async () => {
  log.info('SIGTERM received — draining workers');
  await Promise.all(workers.map((w) => w.close()));
  await closeAgentBus();
  connection.disconnect();
  log.info('Workers shut down cleanly');
  process.exit(0);
});

log.info('PitchFire Agent Workers started', {
  queues: [
    `${QUEUES.discovery} (c=6): scout, score`,
    `${QUEUES.apply} (c=2): tailor, apply`,
    `${QUEUES.comms} (c=4): inbox, schedule, coach`,
  ],
});
