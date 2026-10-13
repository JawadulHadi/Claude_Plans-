import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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
  interview_date: string;   // ISO8601
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

/**
 * SchedulerAgent: Extracts interview details from email thread, creates a Google Calendar
 * event, generates Sonnet-quality prep notes, and records the session in Supabase.
 *
 * Pattern from R&D findings (Area 5):
 * - Haiku structured output to extract { interview_date, duration_minutes, location }
 * - If confidence < 0.8 → flag for user confirmation, do NOT auto-book
 * - Sonnet generates personalised prep notes per company + role
 */
export async function runSchedulerAgent(input: SchedulerInput): Promise<SchedulerOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch application + job details
  const { data: app } = await db
    .from('applications')
    .select('id, user_id, job_id, job_listings(title, company, jd_text, url)')
    .eq('id', input.application_id)
    .single();

  if (!app) {
    console.error('[SchedulerAgent] Application not found:', input.application_id);
    return { session_id: null, calendar_event_id: null, prep_notes_generated: false };
  }

  const job = app.job_listings as { title: string; company: string; jd_text: string; url: string } | null;

  // Step 1: Extract interview details from email thread using Haiku
  const emailContent = await fetchEmailThread(input.email_thread_id);
  const details = await extractInterviewDetails(emailContent, job?.company ?? '');

  if (details.confidence < 0.8) {
    console.log(`[SchedulerAgent] Low confidence (${details.confidence}) — flagging for user confirmation`);
    await db.from('pipeline_events').insert({
      application_id: input.application_id,
      event_type: 'interview_needs_confirmation',
      payload: { details, email_thread_id: input.email_thread_id },
    });
    return { session_id: null, calendar_event_id: null, prep_notes_generated: false };
  }

  // Step 2: Generate prep notes with Sonnet
  const prepNotes = await generatePrepNotes(job, details);

  // Step 3: Create calendar event
  const eventId = await createCalendarEvent(job, details, prepNotes);

  // Step 4: Record interview session in Supabase
  const sessionType = inferSessionType(emailContent);
  const endTime = new Date(new Date(details.interview_date).getTime() + details.duration_minutes * 60_000).toISOString();

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

  // Update application status to interview
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

  console.log(`[SchedulerAgent] Scheduled ${sessionType} for ${job?.company} at ${details.interview_date}`);
  return {
    session_id: session?.id ?? null,
    calendar_event_id: eventId,
    prep_notes_generated: prepNotes.length > 0,
  };
}

// ─── Interview detail extraction ─────────────────────────────────────────────

async function extractInterviewDetails(
  emailContent: string,
  company: string,
): Promise<InterviewDetails> {
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
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
  });

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

// ─── Prep note generation ─────────────────────────────────────────────────────

async function generatePrepNotes(
  job: { title: string; company: string; jd_text: string } | null,
  details: InterviewDetails,
): Promise<string> {
  if (!job) return '';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Calendar event creation ──────────────────────────────────────────────────

async function createCalendarEvent(
  job: { title: string; company: string } | null,
  details: InterviewDetails,
  prepNotes: string,
): Promise<string | null> {
  if (!process.env.GOOGLE_CALENDAR_ACCESS_TOKEN) {
    console.log('[SchedulerAgent] Google Calendar not configured — skipping event creation');
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
      model: 'claude-haiku-5-5',
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
    const data = await res.json();
    return data.id ?? null;
  } catch (err) {
    console.error('[SchedulerAgent] Calendar API error:', (err as Error).message);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchEmailThread(threadId: string): Promise<string> {
  if (!process.env.GMAIL_ACCESS_TOKEN) return `Thread ID: ${threadId}`;

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${process.env.GMAIL_ACCESS_TOKEN}` } },
    );
    const data = await res.json();
    const msg = data.messages?.[data.messages.length - 1];
    const body = msg?.payload?.body?.data ?? '';
    return Buffer.from(body, 'base64').toString('utf-8').slice(0, 3000);
  } catch {
    return '';
  }
}

function inferSessionType(emailContent: string): string {
  const lower = emailContent.toLowerCase();
  if (lower.includes('technical') || lower.includes('coding') || lower.includes('take-home')) return 'technical';
  if (lower.includes('phone') || lower.includes('screen')) return 'phone_screen';
  if (lower.includes('behavioral') || lower.includes('culture')) return 'behavioral';
  if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('in-person')) return 'onsite';
  if (lower.includes('offer')) return 'offer_call';
  return 'phone_screen';
}
