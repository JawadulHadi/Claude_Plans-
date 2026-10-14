import { scrapeJobs } from '@pitchfire/job-scraper';
import type { JobBoard, Database } from '@pitchfire/shared';
import { createClient } from '@supabase/supabase-js';
import { embedText } from '@pitchfire/resume-engine';
import { createLogger } from '../lib/logger.js';
import { publishScore } from '../lib/agent-bus.js';

const log = createLogger('ScoutAgent');

const BACKEND_KEYWORDS = ['NestJS', 'Node.js', 'TypeScript', 'backend', 'API', 'PostgreSQL'];

export interface ScoutInput {
  user_id: string;
  boards: JobBoard[];
  keywords?: string[];
}

export interface ScoutOutput {
  discovered: number;
  stored: number;
  score_triggered: boolean;
  errors: Array<{ board: string; error: string }>;
}

export async function runScoutAgent(input: ScoutInput): Promise<ScoutOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const keywords = input.keywords ?? BACKEND_KEYWORDS;

  const { jobs, errors } = await scrapeJobs({
    keywords,
    boards: input.boards,
    limit: 30,
  });

  let stored = 0;

  for (const job of jobs) {
    if (!job.url || !job.title) continue;

    try {
      const { embedding } = job.jd_text
        ? await embedText(job.jd_text)
        : { embedding: null };

      const { error } = await db.from('job_listings').upsert(
        { ...job, embedding: embedding as unknown as string | null } as Database['public']['Tables']['job_listings']['Insert'],
        { onConflict: 'url', ignoreDuplicates: true },
      );

      if (error) {
        log.warn('Failed to store job listing', { url: job.url, error: error.message });
      } else {
        stored++;
      }
    } catch (err) {
      log.warn('Embedding or upsert failed', { url: job.url, error: (err as Error).message });
    }
  }

  log.info('Scout complete', { discovered: jobs.length, stored, board_errors: errors.length });

  // Trigger scoring pipeline for newly stored jobs
  let scoreTriggered = false;
  if (stored > 0) {
    const { data: resume } = await db
      .from('resumes')
      .select('id')
      .eq('user_id', input.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (resume) {
      await publishScore(input.user_id, resume.id);
      scoreTriggered = true;
      log.info('Published score job', { user_id: input.user_id, resume_id: resume.id });
    } else {
      log.warn('No active resume found — score job not published', { user_id: input.user_id });
    }
  }

  return { discovered: jobs.length, stored, score_triggered: scoreTriggered, errors };
}
