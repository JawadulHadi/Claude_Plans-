import { Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { InterviewSession } from '@pitchfire/shared';
import { enqueueAgentJob } from '../../common/queue.js';

@Injectable()
export class SessionsService {
  private db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  async getByUser(userId: string): Promise<InterviewSession[]> {
    const { data, error } = await this.db
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('scheduled_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as InterviewSession[];
  }

  async update(id: string, patch: Partial<InterviewSession>): Promise<InterviewSession> {
    const { data, error } = await this.db
      .from('sessions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new NotFoundException(error.message);
    return data as InterviewSession;
  }

  async getById(id: string): Promise<InterviewSession> {
    const { data, error } = await this.db
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Session ${id} not found`);
    return data as InterviewSession;
  }

  async generateCoachPrep(sessionId: string): Promise<{ queued: boolean; session_id: string }> {
    // Verify session exists first
    await this.getById(sessionId);
    await enqueueAgentJob({ type: 'coach', session_id: sessionId });
    return { queued: true, session_id: sessionId };
  }
}
