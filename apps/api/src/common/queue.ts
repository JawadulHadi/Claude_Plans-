import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { AgentJob } from '@jobpilot/shared';

const QUEUE_NAME = 'agent-jobs';

let _connection: IORedis | null = null;
let _queue: Queue<AgentJob> | null = null;

function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export function getAgentQueue(): Queue<AgentJob> {
  if (!_queue) {
    _queue = new Queue<AgentJob>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}

export async function enqueueAgentJob(job: AgentJob, delay?: number): Promise<void> {
  await getAgentQueue().add(job.type, job, { delay });
}
