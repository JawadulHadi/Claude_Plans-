// @ts-nocheck — Supabase client without generated DB types
import { scrapeJobs } from '@pitchfire/job-scraper';
import type { JobBoard } from '@pitchfire/shared';
import { createClient } from '@supabase/supabase-js';
import { embedText } from '@pitchfire/resume-engine';

const BACKEND_KEYWORDS = ['NestJS', 'Node.js', 'TypeScript', 'backend', 'API', 'PostgreSQL'];

export interface ScoutInput {
  user_id: string;
  boards: JobBoard[];
  keywords?: string[];
}

export interface ScoutOutput {
  discovered: number;
  stored: number;
  errors: Array<{ board: string; error: string }>;
}

export async function runScoutAgent(input: ScoutInput): Promise<ScoutOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const keywords = input.keywords ?? BACKEND_KEYWORDS;

  // Scout runs on haiku (cheap/fast for discovery — from kedster model routing)
  const { jobs, errors } = await scrapeJobs({
    keywords,
    boards: input.boards,
    limit: 30,
  });

  let stored = 0;

  for (const job of jobs) {
    if (!job.url || !job.title) continue;

    try {
      // Embed the JD for semantic search
      const { embedding } = job.jd_text
        ? await embedText(job.jd_text)
        : { embedding: null };

      const { error } = await db.from('job_listings').upsert(
        { ...job, embedding },
        { onConflict: 'url', ignoreDuplicates: true },
      );

      if (!error) stored++;
    } catch {
      // Non-fatal: skip malformed listings
    }
  }

  console.log(`[ScoutAgent] Discovered: ${jobs.length}, Stored: ${stored}, Errors: ${errors.length}`);
  return { discovered: jobs.length, stored, errors };
}
