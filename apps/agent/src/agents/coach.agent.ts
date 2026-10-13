import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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
 * CoachAgent: Generates interview Q&A, company research, and mock answer guidance
 * for a scheduled interview session.
 *
 * Model: claude-sonnet-4-6 (quality-critical — user will see every word)
 * Called on-demand from /sessions/:id/coach endpoint.
 */
export async function runCoachAgent(input: CoachInput): Promise<CoachOutput> {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch session + application + job data
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
    console.error('[CoachAgent] Session not found:', input.session_id);
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
    return { questions_generated: 0, company_context: '', mock_qa: [] };
  }

  // Step 1: Company context research prompt
  const companyContext = await generateCompanyContext(job.company, job.jd_text);

  // Step 2: Generate role-specific Q&A with answer guidance
  const mockQA = await generateMockQA(job, resumeText, session.type, companyContext);

  // Step 3: Persist enhanced prep notes back to session
  const enhancedNotes = buildEnhancedNotes(companyContext, mockQA, session.prep_notes ?? '');
  await db.from('sessions').update({ prep_notes: enhancedNotes }).eq('id', input.session_id);

  await db.from('pipeline_events').insert({
    application_id: app?.id,
    event_type: 'coach_prep_generated',
    payload: {
      session_id: input.session_id,
      questions_count: mockQA.length,
    },
  });

  console.log(`[CoachAgent] Generated ${mockQA.length} Q&As for ${job.company} — ${session.type}`);
  return {
    questions_generated: mockQA.length,
    company_context: companyContext,
    mock_qa: mockQA,
  };
}

// ─── Company context ──────────────────────────────────────────────────────────

async function generateCompanyContext(company: string, jdText: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Mock Q&A generation ──────────────────────────────────────────────────────

async function generateMockQA(
  job: { title: string; company: string; jd_text: string },
  resumeText: string,
  sessionType: string,
  companyContext: string,
): Promise<Array<{ question: string; answer_guidance: string }>> {
  const questionCount = sessionType === 'onsite' ? 8 : sessionType === 'technical' ? 6 : 5;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  try {
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, questionCount) : [];
  } catch {
    return [];
  }
}

// ─── Notes assembly ───────────────────────────────────────────────────────────

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
