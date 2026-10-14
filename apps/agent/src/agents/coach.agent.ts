import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@pitchfire/shared';
import { createLogger } from '../lib/logger.js';
import { MODELS, callWithRetry, logTokens } from '../lib/models.js';

const log = createLogger('CoachAgent');
const client = new Anthropic();

export interface CoachInput {
  session_id: string;
}

export interface CoachOutput {
  questions_generated: number;
  company_context: string;
  mock_qa: Array<{ question: string; answer_guidance: string }>;
}

/**
 * CoachAgent: Generates interview Q&A, company research, and mock answer guidance.
 * Final node in the agent chain — no downstream publish.
 */
export async function runCoachAgent(input: CoachInput): Promise<CoachOutput> {
  const db = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: session } = await db
    .from('sessions')
    .select(
      `id, type, scheduled_at, interviewer_names, prep_notes,
       applications(
         id, user_id,
         job_listings(title, company, jd_text, url),
         resumes(content_text)
       )`,
    )
    .eq('id', input.session_id)
    .single();

  if (!session) {
    log.error('Session not found', { session_id: input.session_id });
    return { questions_generated: 0, company_context: '', mock_qa: [] };
  }

  const app = session.applications as {
    id: string;
    user_id: string;
    job_listings: { title: string; company: string; jd_text: string; url: string } | null;
    resumes: { content_text: string } | null;
  } | null;

  const job = app?.job_listings ?? null;
  const resumeText = app?.resumes?.content_text ?? '';

  if (!job) {
    log.warn('No job data for session', { session_id: input.session_id });
    return { questions_generated: 0, company_context: '', mock_qa: [] };
  }

  const companyContext = await generateCompanyContext(job.company, job.jd_text);
  const mockQA = await generateMockQA(job, resumeText, session.type, companyContext);

  const enhancedNotes = buildEnhancedNotes(companyContext, mockQA, session.prep_notes ?? '');
  await db.from('sessions').update({ prep_notes: enhancedNotes }).eq('id', input.session_id);

  await db.from('pipeline_events').insert({
    application_id: app!.id,
    event_type: 'coach_prep_generated',
    payload: { session_id: input.session_id, questions_count: mockQA.length },
  });

  log.info('Prep generated', {
    session_id: input.session_id,
    company: job.company,
    session_type: session.type,
    questions_count: mockQA.length,
  });

  return {
    questions_generated: mockQA.length,
    company_context: companyContext,
    mock_qa: mockQA,
  };
}

async function generateCompanyContext(company: string, jdText: string): Promise<string> {
  const response = await callWithRetry(
    () => client.messages.create({
      model: MODELS.QUALITY,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Based on this job description, write a 3-bullet company context for interview prep.
Focus on: (1) what the company does, (2) the team/product this role sits on, (3) one insight that shows you did homework.

Company: ${company}
Job description excerpt:
${jdText.slice(0, 1500)}

Output ONLY 3 bullet points, plain text, each starting with "•".`,
        },
      ],
    }),
    { agentName: 'CoachAgent' },
  );

  logTokens('CoachAgent', MODELS.QUALITY, response.usage, 'company_context');
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

async function generateMockQA(
  job: { title: string; company: string; jd_text: string },
  resumeText: string,
  sessionType: string,
  companyContext: string,
): Promise<Array<{ question: string; answer_guidance: string }>> {
  const questionCount = sessionType === 'onsite' ? 8 : sessionType === 'technical' ? 6 : 5;

  const response = await callWithRetry(
    () => client.messages.create({
      model: MODELS.QUALITY,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Generate ${questionCount} likely interview questions with answer guidance for this interview.

Role: ${job.title} at ${job.company}
Interview type: ${sessionType}
Company context: ${companyContext}

Job description excerpt:
${job.jd_text.slice(0, 1200)}

Candidate resume excerpt:
${resumeText.slice(0, 800)}

Return ONLY valid JSON array:
[
  {
    "question": "...",
    "answer_guidance": "2-3 sentences on the strongest angle to answer this from the candidate's background"
  }
]`,
        },
      ],
    }),
    { agentName: 'CoachAgent' },
  );

  logTokens('CoachAgent', MODELS.QUALITY, response.usage, 'mock_qa');

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  try {
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, questionCount) : [];
  } catch {
    return [];
  }
}

function buildEnhancedNotes(
  companyContext: string,
  mockQA: Array<{ question: string; answer_guidance: string }>,
  existingNotes: string,
): string {
  const qaSection = mockQA
    .map((item, i) => `**Q${i + 1}: ${item.question}**\n${item.answer_guidance}`)
    .join('\n\n');

  return `## Company Context\n\n${companyContext}\n\n## Mock Q&A\n\n${qaSection}\n\n---\n\n${existingNotes}`;
}
