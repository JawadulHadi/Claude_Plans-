import { Injectable } from '@nestjs/common';
import { enqueueAgentJob } from '../../common/queue.js';
import type { AgentJob } from '@pitchfire/shared';

@Injectable()
export class AgentsService {
  async triggerAgent(job: AgentJob) {
    await enqueueAgentJob(job);
    return { queued: job.type, job };
  }

  async triggerFullPipeline(userId: string, resumeId: string) {
    // Conveyor belt parallelism from kedster pattern:
    // Scout + Score run concurrently; Tailor + Apply run per job after scoring
    await Promise.all([
      enqueueAgentJob({ type: 'scout', user_id: userId, boards: ['remoteok', 'wellfound'] }),
      enqueueAgentJob({ type: 'score', resume_id: resumeId, user_id: userId }),
      enqueueAgentJob({ type: 'inbox', user_id: userId }),
    ]);

    return { queued: ['scout', 'score', 'inbox'], mode: 'parallel' };
  }
}
