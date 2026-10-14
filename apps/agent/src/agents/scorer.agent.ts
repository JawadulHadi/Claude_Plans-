import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@pitchfire/shared';
import { scoreResumeAgainstJd } from '@pitchfire/resume-engine';
import { createLogger } from '../lib/logger.js';
import { MODELS, callWithRetry, logTokens } from '../lib/models.js';
import { publishTailor } from '../lib/agent-bus.js';

const log = createLogger('ScorerAgent');
const client = new Anthropic();

const MATCH_THRESHOLD = 0.72;

export interface ScorerInput {
  user_id: string;
  resume_id: string;
}

export interface ScorerOutput {
  scored: number;
  queued_for_tailor: number;
}

export async function runScorerAgent(input: ScorerInput): Promise<ScorerOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: resume } = await db
    .from('resumes')
    .select('content_text')
    .eq('id', input.resume_id)
    .single();

  if (!resume) {
    log.error('Resume not found', { resume_id: input.resume_id });
    return { scored: 0, queued_for_tailor: 0 };
  }

  const { data: existingApps } = await db
    .from('applications')
    .select('job_id')
    .eq('user_id', input.user_id);

  const existingJobIds = (existingApps ?? []).map((a) => a.job_id);

  // BUG FIX: .not('id','in','(null)') matches ZERO rows when list is empty.
  // Skip the filter entirely when there are no existing applications.
  let query = db.from('job_listings').select('id, title, company, jd_text').limit(50);
  if (existingJobIds.length > 0) {
    query = query.not('id', 'in', `(${existingJobIds.join(',')})`);
  }
  const { data: jobs } = await query;

  let scored = 0;
  let queuedForTailor = 0;

  for (const job of jobs ?? []) {
    if (!job.jd_text) continue;

    const result = await callWithRetry(
      () => scoreResumeAgainstJd(resume.content_text, job.jd_text!),
      { agentName: 'ScorerAgent' },
    );
    scored++;

    const { data: app } = await db
      .from('applications')
      .insert({
        user_id: input.user_id,
        job_id: job.id,
        resume_id: input.resume_id,
        match_score: result.score,
        status: result.recommendation === 'skip' ? 'withdrawn' : 'pending_review',
      })
      .select('id')
      .single();

    if (app && result.score >= MATCH_THRESHOLD) {
      queuedForTailor++;
      await publishTailor(app.id);
      log.info('High match — tailor queued', {
        score: result.score.toFixed(2),
        job_title: job.title,
        company: job.company,
        application_id: app.id,
      });
    }
  }

  log.info('Scoring complete', { scored, queued_for_tailor: queuedForTailor });
  return { scored, queued_for_tailor: queuedForTailor };
}
