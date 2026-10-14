import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { AgentJob } from '@pitchfire/shared';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
};

let _connection: IORedis | null = null;
function conn(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
  }
  return _connection;
}

const _queues = new Map<string, Queue<AgentJob>>();
function queue(name: string): Queue<AgentJob> {
  if (!_queues.has(name)) {
    _queues.set(name, new Queue<AgentJob>(name, { connection: conn() }));
  }
  return _queues.get(name)!;
}

/** ScoutAgent → ScorerAgent */
export async function publishScore(userId: string, resumeId: string): Promise<void> {
  await queue('discovery-queue').add(
    'score',
    { type: 'score', user_id: userId, resume_id: resumeId },
    JOB_OPTIONS,
  );
}

/** ScorerAgent → TailorAgent */
export async function publishTailor(applicationId: string): Promise<void> {
  await queue('apply-queue').add(
    'tailor',
    { type: 'tailor', application_id: applicationId },
    JOB_OPTIONS,
  );
}

/** API layer → ApplierAgent (after user approves in /review UI) */
export async function publishApply(applicationId: string): Promise<void> {
  await queue('apply-queue').add(
    'apply',
    { type: 'apply', application_id: applicationId },
    JOB_OPTIONS,
  );
}

/** ApplierAgent → InboxAgent (5-min delay — let email arrive first) */
export async function publishInbox(userId: string): Promise<void> {
  await queue('comms-queue').add(
    'inbox',
    { type: 'inbox', user_id: userId },
    { ...JOB_OPTIONS, delay: 5 * 60 * 1000 },
  );
}

/** InboxAgent → SchedulerAgent (interview invite detected) */
export async function publishSchedule(applicationId: string, emailThreadId: string): Promise<void> {
  await queue('comms-queue').add(
    'schedule',
    { type: 'schedule', application_id: applicationId, email_thread_id: emailThreadId },
    JOB_OPTIONS,
  );
}

/** SchedulerAgent → CoachAgent (session created, generate prep) */
export async function publishCoach(sessionId: string): Promise<void> {
  await queue('comms-queue').add(
    'coach',
    { type: 'coach', session_id: sessionId },
    JOB_OPTIONS,
  );
}

export async function closeAgentBus(): Promise<void> {
  await Promise.all([..._queues.values()].map((q) => q.close()));
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
  _queues.clear();
}
