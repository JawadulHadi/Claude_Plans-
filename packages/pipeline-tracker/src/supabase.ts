import { createClient } from '@supabase/supabase-js';
import type { ApplicationStatus } from '@jobpilot/shared';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

export async function recordTransition(
  applicationId: string,
  fromStatus: ApplicationStatus,
  toStatus: ApplicationStatus,
  payload: Record<string, unknown> = {},
  source = 'agent',
): Promise<void> {
  const supabase = getClient();

  const { error: appError } = await supabase
    .from('applications')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (appError) throw new Error(`Status update failed: ${appError.message}`);

  const { error: eventError } = await supabase.from('pipeline_events').insert({
    application_id: applicationId,
    event_type: `${fromStatus}_to_${toStatus}`,
    from_status: fromStatus,
    to_status: toStatus,
    payload,
    source,
  });

  if (eventError) throw new Error(`Event insert failed: ${eventError.message}`);
}

export async function getApplicationWithDetails(applicationId: string) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      job:job_listings(*),
      resume:resumes(content_text, variants)
    `,
    )
    .eq('id', applicationId)
    .single();

  if (error) throw new Error(`Failed to fetch application: ${error.message}`);
  return data;
}

export async function getPendingReviewApplications(userId: string) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      job:job_listings(id, title, company, url, board, location, salary_min, salary_max),
      resume:resumes(content_text, variants)
    `,
    )
    .eq('user_id', userId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch pending reviews: ${error.message}`);
  return data ?? [];
}

export async function storeAppliedConfirmation(
  applicationId: string,
  confirmationUrl: string,
  confirmationText: string,
): Promise<void> {
  const supabase = getClient();

  await supabase
    .from('applications')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  await supabase.from('pipeline_events').insert({
    application_id: applicationId,
    event_type: 'application_submitted',
    from_status: 'applying',
    to_status: 'applied',
    payload: { confirmation_url: confirmationUrl, confirmation_text: confirmationText },
    source: 'applier_agent',
  });
}
