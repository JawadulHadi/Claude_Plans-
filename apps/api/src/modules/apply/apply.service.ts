import { Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseClient } from '../../common/supabase.js';
import { enqueueAgentJob } from '../../common/queue.js';

@Injectable()
export class ApplyService {
  async getPendingReview(userId: string) {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('applications')
      .select(`
        id,
        status,
        created_at,
        tailor_output,
        job_listings (title, company, board, url, location)
      `)
      .eq('user_id', userId)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async handleDecision(applicationId: string, action: 'approve' | 'withdraw') {
    const db = getSupabaseClient();

    const { data: app } = await db
      .from('applications')
      .select('id, status, user_id')
      .eq('id', applicationId)
      .single();

    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'pending_review') {
      return { skipped: true, reason: `Status is already ${app.status}` };
    }

    if (action === 'withdraw') {
      await db
        .from('applications')
        .update({ status: 'withdrawn', last_event_at: new Date().toISOString() })
        .eq('id', applicationId);

      await db.from('pipeline_events').insert({
        application_id: applicationId,
        event_type: 'status_change',
        from_status: 'pending_review',
        to_status: 'withdrawn',
        source: 'user',
      });

      return { success: true, status: 'withdrawn' };
    }

    // approve → set status to 'approved' then enqueue apply job
    await db
      .from('applications')
      .update({ status: 'approved', last_event_at: new Date().toISOString() })
      .eq('id', applicationId);

    await db.from('pipeline_events').insert({
      application_id: applicationId,
      event_type: 'status_change',
      from_status: 'pending_review',
      to_status: 'approved',
      source: 'user',
    });

    await enqueueAgentJob({ type: 'apply', application_id: applicationId });

    return { success: true, status: 'approved', queued: true };
  }
}
