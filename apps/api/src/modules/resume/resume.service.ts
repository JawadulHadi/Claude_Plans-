import { Injectable, NotFoundException } from '@nestjs/common';
import { parsePdfResume, parseTextResume, embedText } from '@jobpilot/resume-engine';
import { getSupabaseClient } from '../../common/supabase.js';
import { enqueueAgentJob } from '../../common/queue.js';

@Injectable()
export class ResumeService {
  async ingestResume(userId: string, fileBuffer: Buffer, filename: string) {
    const db = getSupabaseClient();

    // Parse
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    const parsed = isPdf
      ? await parsePdfResume(fileBuffer)
      : await parseTextResume(fileBuffer.toString('utf8'));

    // Embed
    const { embedding } = await embedText(parsed.text);

    // Store
    const { data, error } = await db
      .from('resumes')
      .insert({
        user_id: userId,
        content_text: parsed.text,
        embedding,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to store resume: ${error.message}`);

    // Deactivate previous resumes
    await db
      .from('resumes')
      .update({ is_active: false })
      .eq('user_id', userId)
      .neq('id', data.id);

    // Enqueue scoring job
    await enqueueAgentJob({ type: 'score', resume_id: data.id, user_id: userId });

    return { id: data.id, pages: parsed.pageCount, enqueued: 'score' };
  }

  async getResume(id: string) {
    const db = getSupabaseClient();
    const { data, error } = await db.from('resumes').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundException(`Resume ${id} not found`);
    return data;
  }

  async getActiveResume(userId: string) {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
    if (error || !data) throw new NotFoundException(`No active resume for user ${userId}`);
    return data;
  }

  async triggerJobScoring(userId: string, resumeId: string) {
    await enqueueAgentJob({
      type: 'scout',
      user_id: userId,
      boards: ['remoteok', 'wellfound'],
    });
    await enqueueAgentJob({ type: 'score', resume_id: resumeId, user_id: userId });
    return { enqueued: ['scout', 'score'] };
  }
}
