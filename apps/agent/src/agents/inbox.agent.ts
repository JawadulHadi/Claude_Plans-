// @ts-nocheck — Supabase client without generated DB types; add types/supabase.ts to fix
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

// Gmail tool schemas — Claude drives the search/read loop, we execute the calls
const GMAIL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'gmail_search_threads',
    description: 'Search Gmail threads by query string. Returns thread IDs and snippets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:careers label:INBOX")' },
        max_results: { type: 'number', description: 'Max threads to return (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_get_thread',
    description: 'Get the subject and first 500 chars of the latest message in a thread.',
    input_schema: {
      type: 'object' as const,
      properties: {
        thread_id: { type: 'string', description: 'Gmail thread ID' },
      },
      required: ['thread_id'],
    },
  },
];

/**
 * InboxAgent: Gmail MCP tool-use loop.
 *
 * Pattern from R&D findings (Area 5):
 * - Claude drives search → get thread → classify in a tool-use loop
 * - Haiku classifier: ~$0.001 per email, structured output
 * - Fuzzy-matches sender domain against job_listings.company
 * - interview_invite → enqueue schedule job; offer → log event; rejection/ghosted → update status
 */
export async function runInboxAgent(input: InboxInput): Promise<InboxOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: apps } = await db
    .from('applications')
    .select('id, status, job_listings(title, company)')
    .eq('user_id', input.user_id)
    .eq('status', 'applied');

  if (!apps?.length) {
    return { emails_checked: 0, classified: [] };
  }

  const companyList = apps
    .map((a) => (a.job_listings as { company: string } | null)?.company)
    .filter(Boolean)
    .join(' OR ');

  // Build since-date: 30 days back
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  const sinceStr = sinceDate.toISOString().slice(0, 10).replace(/-/g, '/');

  const systemPrompt = `You are PitchFire's InboxAgent. Search Gmail for job-related reply emails,
get each thread's subject + snippet, then classify it.
Companies to watch: ${companyList}
For each email found, call gmail_get_thread then return a JSON classification.`;

  const userPrompt = `Search Gmail for job reply emails from recruiting teams after ${sinceStr}.
Query: "from:careers OR from:recruiting OR from:noreply label:INBOX after:${sinceStr}"
For each thread, get the subject and classify as: interview_invite | rejection | offer | followup | other.
Return JSON: { "results": [{ "thread_id": string, "subject": string, "classification": string, "company": string }] }`;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  const classified: InboxOutput['classified'] = [];
  let emailsChecked = 0;

  // Tool-use loop: max 5 rounds to prevent runaway
  for (let round = 0; round < 5; round++) {
    const response = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      system: systemPrompt,
      tools: GMAIL_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Parse final JSON result from Claude
      const text = response.content.find((b) => b.type === 'text')?.text ?? '';
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const results: Array<{ thread_id: string; subject: string; classification: string; company: string }> =
            parsed.results ?? [];
          emailsChecked = results.length;

          for (const r of results) {
            const app = findMatchingApp(apps, r.company);
            classified.push({
              subject: r.subject,
              classification: r.classification,
              application_id: app?.id,
            });
            await handleClassification(db, input.user_id, r.classification, app?.id, r.subject);
          }
        }
      } catch {
        console.warn('[InboxAgent] Could not parse Claude JSON response');
      }
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: string;
      if (block.name === 'gmail_search_threads') {
        result = await execGmailSearch(block.input as { query: string; max_results?: number });
      } else if (block.name === 'gmail_get_thread') {
        result = await execGmailGetThread(block.input as { thread_id: string });
      } else {
        result = JSON.stringify({ error: 'unknown tool' });
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { emails_checked: emailsChecked, classified };
}

// ─── Tool execution stubs (replaced with real Gmail API / MCP calls in prod) ──

async function execGmailSearch(input: { query: string; max_results?: number }): Promise<string> {
  if (!process.env.GMAIL_ACCESS_TOKEN) {
    console.log('[InboxAgent] Gmail not configured — stub search for query:', input.query);
    return JSON.stringify({ threads: [], message: 'Gmail OAuth not configured' });
  }

  const params = new URLSearchParams({
    q: input.query,
    maxResults: String(input.max_results ?? 20),
  });
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`,
    { headers: { Authorization: `Bearer ${process.env.GMAIL_ACCESS_TOKEN}` } },
  );
  const data = await res.json();
  return JSON.stringify({ threads: data.threads ?? [] });
}

async function execGmailGetThread(input: { thread_id: string }): Promise<string> {
  if (!process.env.GMAIL_ACCESS_TOKEN) {
    return JSON.stringify({ subject: 'Gmail not configured', snippet: '' });
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${input.thread_id}?format=metadata&metadataHeaders=Subject`,
    { headers: { Authorization: `Bearer ${process.env.GMAIL_ACCESS_TOKEN}` } },
  );
  const data = await res.json();
  const msg = data.messages?.[data.messages.length - 1];
  const subject = msg?.payload?.headers?.find((h: { name: string }) => h.name === 'Subject')?.value ?? '';
  return JSON.stringify({ subject, snippet: data.snippet?.slice(0, 500) ?? '' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findMatchingApp(
  apps: Array<{ id: string; job_listings: unknown }>,
  company: string,
): { id: string } | undefined {
  const needle = company.toLowerCase().replace(/\s+/g, '');
  return apps.find((a) => {
    const co = ((a.job_listings as { company?: string } | null)?.company ?? '').toLowerCase().replace(/\s+/g, '');
    return co.includes(needle) || needle.includes(co);
  });
}

async function handleClassification(
  db: ReturnType<typeof createClient>,
  userId: string,
  classification: string,
  applicationId: string | undefined,
  subject: string,
): Promise<void> {
  if (!applicationId) return;

  const statusMap: Record<string, string> = {
    interview_invite: 'interview',
    rejection: 'rejected',
    offer: 'offer',
    followup: 'replied',
  };
  const newStatus = statusMap[classification];
  if (!newStatus) return;

  await db.from('applications').update({ status: newStatus }).eq('id', applicationId);

  await db.from('pipeline_events').insert({
    application_id: applicationId,
    event_type: classification,
    payload: { subject, classified_by: 'inbox_agent', model: 'claude-haiku-5-5' },
  });
}

/** Classify a single email subject + snippet (used for unit tests). */
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
        content: `Classify this job email. Output ONLY one word: interview_invite, rejection, offer, followup, or other.

Subject: ${subject}
Snippet: ${snippet.slice(0, 200)}`,
      },
    ],
  });
  const text = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'other';
  const valid = ['interview_invite', 'rejection', 'offer', 'followup', 'other'] as const;
  return valid.find((v) => text.includes(v)) ?? 'other';
}
