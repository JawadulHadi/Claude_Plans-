import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@pitchfire/shared';
import { tailorResumeForJob } from '@pitchfire/resume-engine';
import { createLogger } from '../lib/logger.js';

const log = createLogger('TailorAgent');

export interface TailorInput {
  application_id: string;
}

export interface TailorOutput {
  variant_label: string;
  cover_letter_length: number;
  integrity_passed: boolean;
}

/**
 * TailorAgent generates a tailored resume variant + cover letter.
 *
 * INTENTIONALLY does NOT publish to ApplierAgent.
 * The /review UI is the approval gate — the API's POST /apply/:id
 * calls publishApply() only after the user explicitly approves.
 */
export async function runTailorAgent(input: TailorInput): Promise<TailorOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: app } = await db
    .from('applications')
    .select(`
      *,
      job_listings (title, company, jd_text),
      resumes (content_text)
    `)
    .eq('id', input.application_id)
    .single();

  if (!app) throw new Error(`Application ${input.application_id} not found`);

  const job = app.job_listings as { title: string; company: string; jd_text: string };
  const resume = app.resumes as { content_text: string };

  const output = await tailorResumeForJob(
    resume.content_text,
    job.jd_text,
    job.title,
    job.company,
    [],
  );

  if (!output.integrityCheck.passed) {
    log.warn('Integrity check failed — blocking for review', {
      application_id: input.application_id,
      issues: output.integrityCheck.issues,
    });
    await db
      .from('applications')
      .update({
        status: 'pending_review',
        notes: `Integrity issues: ${output.integrityCheck.issues.join('; ')}`,
      })
      .eq('id', input.application_id);

    return {
      variant_label: output.variant.label,
      cover_letter_length: output.coverLetter.length,
      integrity_passed: false,
    };
  }

  if (app.resume_id) {
    const { data: resumeRecord } = await db
      .from('resumes')
      .select('variants')
      .eq('id', app.resume_id)
      .single();

    const variants = [...((resumeRecord?.variants as unknown[]) ?? []), output.variant];
    await db.from('resumes').update({ variants: variants as Json }).eq('id', app.resume_id);
  }

  await db
    .from('applications')
    .update({
      resume_variant_label: output.variant.label,
      cover_letter_text: output.coverLetter,
      status: 'approved',
    })
    .eq('id', input.application_id);

  log.info('Tailored — awaiting user approval', {
    application_id: input.application_id,
    job_title: job.title,
    company: job.company,
    variant_label: output.variant.label,
  });

  return {
    variant_label: output.variant.label,
    cover_letter_length: output.coverLetter.length,
    integrity_passed: true,
  };
}
