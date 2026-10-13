import { Injectable } from '@nestjs/common';
import { getSupabaseClient } from '../../common/supabase.js';
import { embedText } from '@pitchfire/resume-engine';
import type { JobListing } from '@pitchfire/shared';

@Injectable()
export class JobsService {
  async getMatchedJobs(userId: string, limit = 20): Promise<JobListing[]> {
    const db = getSupabaseClient();

    // Get user's active resume embedding
    const { data: resume } = await db
      .from('resumes')
      .select('embedding')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!resume?.embedding) return [];

    // Semantic search using pgvector
    const { data } = await db.rpc('match_jobs_for_resume', {
      resume_embedding: resume.embedding,
      match_threshold: 0.72,
      match_count: limit,
    });

    return (data ?? []) as JobListing[];
  }

  async upsertJobListing(job: Partial<JobListing>): Promise<string> {
    const db = getSupabaseClient();

    let embedding: number[] | null = null;
    if (job.jd_text) {
      const result = await embedText(job.jd_text);
      embedding = result.embedding;
    }

    const { data, error } = await db
      .from('job_listings')
      .upsert(
        { ...job, embedding },
        { onConflict: 'url', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (error) throw new Error(`Failed to upsert job: ${error.message}`);
    return data.id;
  }

  async getJobById(id: string) {
    const db = getSupabaseClient();
    const { data } = await db.from('job_listings').select('*').eq('id', id).single();
    return data;
  }
}
