import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@pitchfire/shared';
import { scoreResumeAgainstJd } from '@pitchfire/resume-engine';

const client = new Anthropic();

export interface ScorerInput {
  user_id: string;
  resume_id: string;
}

export interface ScorerOutput {
  scored: number;
  queued_for_tailor: number;
}

/**
 * ScorerAgent: Uses Claude Haiku (cheap/fast) to score all unscored jobs
 * against the user's resume. Jobs scoring > 0.72 are queued for tailoring.
 *
 * Model: claude-haiku-5-5 (from kedster pattern: cheap for filtering/routing)
 */
export async function runScorerAgent(input: ScorerInput): Promise<ScorerOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get active resume
  const { data: resume } = await db
    .from('resumes')
    .select('content_text')
    .eq('id', input.resume_id)
    .single();

  if (!resume) {
    console.error('[ScorerAgent] Resume not found:', input.resume_id);
    return { scored: 0, queued_for_tailor: 0 };
  }

  // Get unscored jobs (not already in applications for this user)
  const { data: existingApps } = await db
    .from('applications')
    .select('job_id')
    .eq('user_id', input.user_id);

  const existingJobIds = (existingApps ?? []).map((a) => a.job_id);

  const { data: jobs } = await db
    .from('job_listings')
    .select('id, title, company, jd_text')
    .not('id', 'in', existingJobIds.length > 0 ? `(${existingJobIds.join(',')})` : '(null)')
    .limit(50);

  let scored = 0;
  let queuedForTailor = 0;

  for (const job of jobs ?? []) {
    if (!job.jd_text) continue;

    const result = await scoreResumeAgainstJd(resume.content_text, job.jd_text);
    scored++;

    // Store application regardless of score (user can see all matches)
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

    if (app && result.score >= 0.72) {
      queuedForTailor++;
      // In production: enqueue tailor job via BullMQ
      console.log(`[ScorerAgent] High match (${result.score.toFixed(2)}): ${job.title} @ ${job.company}`);
    }
  }

  console.log(`[ScorerAgent] Scored: ${scored}, Queued for tailor: ${queuedForTailor}`);
  return { scored, queued_for_tailor: queuedForTailor };
}
