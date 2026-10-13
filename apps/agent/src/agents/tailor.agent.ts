import { createClient } from '@supabase/supabase-js';
import { tailorResumeForJob } from '@pitchfire/resume-engine';
import type { ScoringResult } from '@pitchfire/resume-engine';

export interface TailorInput {
  application_id: string;
}

export interface TailorOutput {
  variant_label: string;
  cover_letter_length: number;
  integrity_passed: boolean;
}

/**
 * TailorAgent: Uses Claude Sonnet (quality-critical) to generate a tailored
 * resume variant + cover letter for a specific application.
 *
 * Model: claude-sonnet-4-6 (from kedster: opus/sonnet for quality-critical tasks)
 * Loop: critique → revise up to 2 rounds (from sreekarrs LoopAgent pattern)
 */
export async function runTailorAgent(input: TailorInput): Promise<TailorOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch application with job and resume
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

  // Generate tailored output (includes critique loop + integrity check)
  const output = await tailorResumeForJob(
    resume.content_text,
    job.jd_text,
    job.title,
    job.company,
    [],   // missing skills populated from scorer data in Phase 2
  );

  if (!output.integrityCheck.passed) {
    console.warn('[TailorAgent] Integrity issues:', output.integrityCheck.issues);
    // Update status to blocked for manual review
    await db
      .from('applications')
      .update({ status: 'pending_review', notes: `Integrity issues: ${output.integrityCheck.issues.join('; ')}` })
      .eq('id', input.application_id);

    return {
      variant_label: output.variant.label,
      cover_letter_length: output.coverLetter.length,
      integrity_passed: false,
    };
  }

  // Store variant in resume record
  const { data: resumeRecord } = await db
    .from('resumes')
    .select('variants')
    .eq('id', app.resume_id)
    .single();

  const variants = [...((resumeRecord?.variants as unknown[]) ?? []), output.variant];

  await db.from('resumes').update({ variants }).eq('id', app.resume_id);

  // Update application with cover letter and variant
  await db
    .from('applications')
    .update({
      resume_variant_label: output.variant.label,
      cover_letter_text: output.coverLetter,
      status: 'approved',
    })
    .eq('id', input.application_id);

  console.log(`[TailorAgent] Tailored for ${job.title} @ ${job.company}`);
  return {
    variant_label: output.variant.label,
    cover_letter_length: output.coverLetter.length,
    integrity_passed: true,
  };
}
