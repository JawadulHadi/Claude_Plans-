import { z } from 'zod';

// ─── Plan / Billing ──────────────────────────────────────────────────────────

export const PlanSchema = z.enum(['free', 'pro', 'agency']);
export type Plan = z.infer<typeof PlanSchema>;

export const PLAN_LIMITS: Record<Plan, { applications_per_month: number; boards: number }> = {
  free:   { applications_per_month: 10,  boards: 3  },
  pro:    { applications_per_month: 9999, boards: 15 },
  agency: { applications_per_month: 9999, boards: 15 },
};

// ─── Job Board ───────────────────────────────────────────────────────────────

export const JobBoardSchema = z.enum([
  'linkedin', 'indeed', 'wellfound', 'remoteok',
  'lever', 'greenhouse', 'workday', 'ashby',
  'ycombinator', 'simplyhired', 'dice', 'glassdoor',
]);
export type JobBoard = z.infer<typeof JobBoardSchema>;

export const JobListingSchema = z.object({
  id:               z.string().uuid(),
  title:            z.string(),
  company:          z.string(),
  location:         z.string().nullable(),
  remote_ok:        z.boolean().default(false),
  board:            JobBoardSchema,
  external_id:      z.string().nullable(),
  url:              z.string().url(),
  jd_text:          z.string(),
  salary_min:       z.number().nullable(),
  salary_max:       z.number().nullable(),
  salary_currency:  z.string().default('USD'),
  scraped_at:       z.string().datetime(),
});
export type JobListing = z.infer<typeof JobListingSchema>;

export const JobMatchSchema = JobListingSchema.extend({
  similarity: z.number().min(0).max(1),
});
export type JobMatch = z.infer<typeof JobMatchSchema>;

// ─── Resume ───────────────────────────────────────────────────────────────────

export const ResumeVariantSchema = z.object({
  label:      z.string(),   // 'variant-a-backend-lead' | 'variant-b-ai-engineer'
  content:    z.string(),   // Markdown resume text
  created_at: z.string().datetime(),
});
export type ResumeVariant = z.infer<typeof ResumeVariantSchema>;

export const ResumeSchema = z.object({
  id:           z.string().uuid(),
  user_id:      z.string().uuid(),
  file_path:    z.string().nullable(),
  content_text: z.string(),
  variants:     z.array(ResumeVariantSchema).default([]),
  is_active:    z.boolean().default(true),
  created_at:   z.string().datetime(),
});
export type Resume = z.infer<typeof ResumeSchema>;

// ─── Application ─────────────────────────────────────────────────────────────

export const ApplicationStatusSchema = z.enum([
  'pending_review',
  'approved',
  'applying',
  'applied',
  'bounced',
  'replied',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationSchema = z.object({
  id:                   z.string().uuid(),
  user_id:              z.string().uuid(),
  job_id:               z.string().uuid(),
  resume_id:            z.string().uuid().nullable(),
  resume_variant_label: z.string().nullable(),
  cover_letter_text:    z.string().nullable(),
  match_score:          z.number().min(0).max(1).nullable(),
  status:               ApplicationStatusSchema,
  applied_at:           z.string().datetime().nullable(),
  last_event_at:        z.string().datetime(),
  notes:                z.string().nullable(),
  created_at:           z.string().datetime(),
});
export type Application = z.infer<typeof ApplicationSchema>;

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const SessionTypeSchema = z.enum([
  'phone_screen', 'technical', 'behavioral', 'onsite', 'offer_call', 'followup',
]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const InterviewSessionSchema = z.object({
  id:                       z.string().uuid(),
  user_id:                  z.string().uuid(),
  application_id:           z.string().uuid().nullable(),
  type:                     SessionTypeSchema,
  scheduled_at:             z.string().datetime().nullable(),
  duration_minutes:         z.number().default(60),
  google_calendar_event_id: z.string().nullable(),
  interviewer_names:        z.array(z.string()).default([]),
  prep_notes:               z.string().nullable(),
  outcome:                  z.string().nullable(),
  created_at:               z.string().datetime(),
});
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;

// ─── Agent Events (BullMQ payloads) ──────────────────────────────────────────

export const AgentJobSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scout'),    boards: z.array(JobBoardSchema), user_id: z.string().uuid() }),
  z.object({ type: z.literal('score'),    resume_id: z.string().uuid(), user_id: z.string().uuid() }),
  z.object({ type: z.literal('tailor'),   application_id: z.string().uuid() }),
  z.object({ type: z.literal('apply'),    application_id: z.string().uuid() }),
  z.object({ type: z.literal('inbox'),    user_id: z.string().uuid() }),
  z.object({ type: z.literal('schedule'), application_id: z.string().uuid(), email_thread_id: z.string() }),
]);
export type AgentJob = z.infer<typeof AgentJobSchema>;
