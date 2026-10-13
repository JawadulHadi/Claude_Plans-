import { Injectable } from '@nestjs/common';
import { getSupabaseClient } from '../../common/supabase.js';
import type { ApplicationStatus } from '@pitchfire/shared';

@Injectable()
export class PipelineService {
  async getApplicationsByUser(userId: string) {
    const db = getSupabaseClient();
    const { data } = await db
      .from('applications')
      .select(`
        *,
        job_listings (title, company, board, url, location),
        resumes (id)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async updateStatus(applicationId: string, status: ApplicationStatus, source: string) {
    const db = getSupabaseClient();

    const { data: current } = await db
      .from('applications')
      .select('status')
      .eq('id', applicationId)
      .single();

    await db
      .from('applications')
      .update({ status, last_event_at: new Date().toISOString() })
      .eq('id', applicationId);

    await db.from('pipeline_events').insert({
      application_id: applicationId,
      event_type: 'status_change',
      from_status: current?.status,
      to_status: status,
      source,
    });

    return { updated: applicationId, to: status };
  }

  async getPipelineSummary(userId: string) {
    const db = getSupabaseClient();
    const { data } = await db
      .from('applications')
      .select('status')
      .eq('user_id', userId);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }

    return counts;
  }
}
