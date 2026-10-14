import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@pitchfire/shared';
import { createLogger } from '../lib/logger.js';
import { MODELS, callWithRetry, logTokens } from '../lib/models.js';
import { publishCoach } from '../lib/agent-bus.js';

const log = createLogger('SchedulerAgent');
const client = new Anthropic();

export interface SchedulerInput {
  application_id: string;
  email_thread_id: string;
}

export interface SchedulerOutput {
  session_id: string | null;
  calendar_event_id: string | null;
  prep_notes_generated: boolean;
}

interface InterviewDetails {
  interview_date: string;
  duration_minutes: number;
  location: string | null;
  interviewers: string[];
  confidence: number;
}

const CALENDAR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'calendar_create_event',
    description: 'Create a Google Calendar event for an interview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'Event title' },
        start_datetime: { type: 'string', description: 'ISO8601 start time' },
        end_datetime: { type: 'string', description: 'ISO8601 end time' },
        location: { type: 'string', description: 'Location or video call link' },
        description: { type: 'string', description: 'Event body / prep notes' },
      },
      required: ['summary', 'start_datetime', 'end_datetime'],
    },
  },
];

export async function runSchedulerAgent(input: SchedulerInput): Promise<SchedulerOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: app } = await db
    .from('applications')
    .select('id, user_id, job_id, job_listings(title, company, jd_text, url)')
    .eq('id', input.application_id)
    .single();

  if (!app) {
    log.error('Application not found', { application_id: input.application_id });
    return { session_id: null, calendar_event_id: null, prep_notes_generated: false };
  }

  const job = (app.job_listings as unknown) as { title: string; company: string; jd_text: string; url: string } | null;

  const emailContent = await fetchEmailThread(input.email_thread_id);
  const details = await extractInterviewDetails(emailContent, job?.company ?? '');

  if (details.confidence < 0.8) {
    log.warn('Low confidence — flagging for user confirmation', {
      confidence: details.confidence,
      application_id: input.application_id,
    });
    await db.from('pipeline_events').insert({
      application_id: input.application_id,
      event_type: 'interview_needs_confirmation',
      payload: { details, email_thread_id: input.email_thread_id } as unknown as Json,
    });
    return { session_id: null, calendar_event_id: null, prep_notes_generated: false };
  }

  const prepNotes = await generatePrepNotes(job, details);
  const eventId = await createCalendarEvent(job, details, prepNotes);
  const sessionType = inferSessionType(emailContent);

  const { data: session } = await db
    .from('sessions')
    .insert({
      user_id: app.user_id,
      application_id: input.application_id,
      type: sessionType,
      scheduled_at: details.interview_date,
      duration_minutes: details.duration_minutes,
      google_calendar_event_id: eventId,
      interviewer_names: details.interviewers,
      prep_notes: prepNotes,
    })
    .select('id')
    .single();

  await db.from('applications').update({ status: 'interview' }).eq('id', input.application_id);

  await db.from('pipeline_events').insert({
    application_id: input.application_id,
    event_type: 'session_scheduled',
    payload: {
      session_id: session?.id,
      calendar_event_id: eventId,
      scheduled_at: details.interview_date,
    },
  });

  // Trigger CoachAgent to generate interview prep
  if (session?.id) {
    await publishCoach(session.id);
    log.info('Session created — coach job published', { session_id: session.id, company: job?.company });
  }

  log.info('Interview scheduled', {
    session_type: sessionType,
    company: job?.company,
    scheduled_at: details.interview_date,
    calendar_event_id: eventId,
  });

  return {
    session_id: session?.id ?? null,
    calendar_event_id: eventId,
    prep_notes_generated: prepNotes.length > 0,
  };
}

async function extractInterviewDetails(
  emailContent: string,
  company: string,
): Promise<InterviewDetails> {
  const response = await callWithRetry(
    () => client.messages.create({
      model: MODELS.FAST,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Extract interview scheduling details from this email. Return ONLY valid JSON.

Email:
${emailContent.slice(0, 2000)}

Return: {
  "interview_date": "<ISO8601 datetime or null>",
  "duration_minutes": <number, default 60>,
  "location": "<string or null>",
  "interviewers": ["<name>", ...],
  "confidence": <0.0-1.0>
}`,
        },
      ],
    }),
    { agentName: 'SchedulerAgent' },
  );

  logTokens('SchedulerAgent', MODELS.FAST, response.usage, 'extract_interview_details');

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      interview_date: parsed.interview_date ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
      duration_minutes: parsed.duration_minutes ?? 60,
      location: parsed.location ?? null,
      interviewers: Array.isArray(parsed.interviewers) ? parsed.interviewers : [],
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return {
      interview_date: new Date(Date.now() + 7 * 86400_000).toISOString(),
      duration_minutes: 60,
      location: null,
      interviewers: [],
      confidence: 0.0,
    };
  }
}

async function generatePrepNotes(
  job: { title: string; company: string; jd_text: string } | null,
  details: InterviewDetails,
): Promise<string> {
  if (!job) return '';

  const response = await callWithRetry(
    () => client.messages.create({
      model: MODELS.QUALITY,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Generate concise interview prep notes for a ${job.title} role at ${job.company}.

Job description excerpt:
${job.jd_text.slice(0, 1500)}

Interview type: ${details.interviewers.length > 0 ? `with ${details.interviewers.join(', ')}` : 'TBD'}
Duration: ${details.duration_minutes} minutes

Include:
1. 3 likely interview questions with strong answer angles
2. Key talking points about relevant experience
3. 2 smart questions to ask the interviewer
4. One-sentence company context

Format as plain Markdown.`,
        },
      ],
    }),
    { agentName: 'SchedulerAgent' },
  );

  logTokens('SchedulerAgent', MODELS.QUALITY, response.usage, 'generate_prep_notes');
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

async function createCalendarEvent(
  job: { title: string; company: string } | null,
  details: InterviewDetails,
  prepNotes: string,
): Promise<string | null> {
  if (!process.env.GOOGLE_CALENDAR_ACCESS_TOKEN) {
    log.debug('Google Calendar not configured — skipping event creation');
    return null;
  }

  const title = job ? `Interview: ${job.title} @ ${job.company}` : 'Interview';
  const endTime = new Date(
    new Date(details.interview_date).getTime() + details.duration_minutes * 60_000,
  ).toISOString();

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Create a Google Calendar event:
Title: "${title}"
Start: ${details.interview_date}
End: ${endTime}
Location: ${details.location ?? 'TBD'}
Description: Interview prep notes attached.`,
    },
  ];

  for (let round = 0; round < 3; round++) {
    const response = await client.messages.create({
      model: MODELS.FAST,
      max_tokens: 512,
      tools: CALENDAR_TOOLS,
      messages,
    });
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;
    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'calendar_create_event') {
        const eventId = await execCalendarCreate(
          block.input as {
            summary: string;
            start_datetime: string;
            end_datetime: string;
            location?: string;
            description?: string;
          },
        );
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ event_id: eventId }) });
        if (eventId) return eventId;
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return null;
}

async function execCalendarCreate(input: {
  summary: string;
  start_datetime: string;
  end_datetime: string;
  location?: string;
  description?: string;
}): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GOOGLE_CALENDAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        start: { dateTime: input.start_datetime, timeZone: 'America/New_York' },
        end: { dateTime: input.end_datetime, timeZone: 'America/New_York' },
        location: input.location,
        description: input.description,
      }),
    });
    const data = await res.json() as Record<string, unknown>;
    return (data.id as string | undefined) ?? null;
  } catch (err) {
    log.error('Calendar API error', { error: (err as Error).message });
    return null;
  }
}

async function fetchEmailThread(threadId: string): Promise<string> {
  if (!process.env.GMAIL_ACCESS_TOKEN) return `Thread ID: ${threadId}`;

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${process.env.GMAIL_ACCESS_TOKEN}` } },
    );
    const data = await res.json() as { messages?: Array<{ payload?: { body?: { data?: string } } }> };
    const msg = data.messages?.[data.messages.length - 1];
    const body = msg?.payload?.body?.data ?? '';
    return Buffer.from(body, 'base64').toString('utf-8').slice(0, 3000);
  } catch {
    return '';
  }
}

function inferSessionType(
  emailContent: string,
): 'phone_screen' | 'technical' | 'behavioral' | 'onsite' | 'offer_call' | 'followup' {
  const lower = emailContent.toLowerCase();
  if (lower.includes('technical') || lower.includes('coding') || lower.includes('take-home')) return 'technical';
  if (lower.includes('phone') || lower.includes('screen')) return 'phone_screen';
  if (lower.includes('behavioral') || lower.includes('culture')) return 'behavioral';
  if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('in-person')) return 'onsite';
  if (lower.includes('offer')) return 'offer_call';
  return 'phone_screen';
}
