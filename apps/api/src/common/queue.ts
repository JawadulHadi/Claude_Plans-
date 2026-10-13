import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { AgentJob } from '@pitchfire/shared';

// Phase 3: 3 typed queues matching the worker
// Must stay in sync with apps/agent/src/worker.ts QUEUES constant
const QUEUE_NAMES = {
  discovery: 'discovery-queue',
  apply:     'apply-queue',
  comms:     'comms-queue',
} as const;

type QueueKey = keyof typeof QUEUE_NAMES;

const JOB_TO_QUEUE: Record<AgentJob['type'], QueueKey> = {
  scout:    'discovery',
  score:    'discovery',
  tailor:   'apply',
  apply:    'apply',
  inbox:    'comms',
  schedule: 'comms',
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

let _connection: IORedis | null = null;
const _queues: Partial<Record<QueueKey, Queue<AgentJob>>> = {};

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
  }
  return _connection;
}

function getQueue(key: QueueKey): Queue<AgentJob> {
  if (!_queues[key]) {
    _queues[key] = new Queue<AgentJob>(QUEUE_NAMES[key], {
      connection: getConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _queues[key]!;
}

export async function enqueueAgentJob(job: AgentJob, delay?: number): Promise<void> {
  const key = JOB_TO_QUEUE[job.type];
  await getQueue(key).add(job.type, job, { delay });
}

// Kept for backwards-compat: callers that used getAgentQueue() previously
export function getAgentQueue(): Queue<AgentJob> {
  return getQueue('discovery');
}
