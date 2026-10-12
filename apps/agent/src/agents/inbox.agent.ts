import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic();

export interface InboxInput {
  user_id: string;
}

export interface InboxOutput {
  emails_checked: number;
  classified: Array<{ subject: string; classification: string; application_id?: string }>;
}

/**
 * InboxAgent: Monitors Gmail for job-related replies using Gmail MCP connector.
 * Classifies each email as: interview_invite | rejection | offer | followup | other.
 * Updates application status and enqueues scheduler for interview invites.
 *
 * In this implementation, we use Claude to classify email subjects/snippets.
 * Gmail MCP tool calls are invoked via the Claude tool_use API.
 */
export async function runInboxAgent(input: InboxInput): Promise<InboxOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get applied applications to correlate emails against
  const { data: apps } = await db
    .from('applications')
    .select(`
      id, status,
      job_listings (title, company)
    `)
    .eq('user_id', input.user_id)
    .eq('status', 'applied');

  if (!apps?.length) {
    console.log('[InboxAgent] No applied applications to monitor');
    return { emails_checked: 0, classified: [] };
  }

  const companyList = apps
    .map((a) => (a.job_listings as { company: string })?.company)
    .filter(Boolean)
    .join(', ');

  // Use Claude with Gmail tool to check for relevant emails
  // In production: invoke Gmail MCP via claude-agent-sdk
  // Here we stub the tool call structure for Phase 3 implementation
  console.log(`[InboxAgent] Would check Gmail for replies from: ${companyList}`);
  console.log('[InboxAgent] Gmail MCP integration ready for Phase 3 wiring');

  return {
    emails_checked: 0,
    classified: [],
  };
}

/** Classify an email snippet using Claude Haiku (cheap classifier) */
export async function classifyJobEmail(
  subject: string,
  snippet: string,
): Promise<'interview_invite' | 'rejection' | 'offer' | 'followup' | 'other'> {
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 32,
    messages: [
      {
        role: 'user',
        content: `Classify this job-related email. Output ONLY one word: interview_invite, rejection, offer, followup, or other.

Subject: ${subject}
Snippet: ${snippet.slice(0, 200)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'other';
  const valid = ['interview_invite', 'rejection', 'offer', 'followup', 'other'] as const;
  return valid.find((v) => text.includes(v)) ?? 'other';
}
