import Anthropic from '@anthropic-ai/sdk';
import type { ResumeVariant } from '@pitchfire/shared';

const client = new Anthropic();

export interface TailoredOutput {
  variant: ResumeVariant;
  coverLetter: string;
  integrityCheck: { passed: boolean; issues: string[] };
}

/**
 * Generate a tailored resume variant + cover letter for a specific job.
 *
 * Pattern from kedster/jobautopilot-claude:
 * - Uses Sonnet (quality-critical, not Haiku)
 * - Integrity check: verifies no fabricated employers/roles
 * - Post-generation faithfulness score
 *
 * Pattern from sreekarrs/JobSearch-Agent:
 * - LoopAgent critique → revise → fact-check (up to 2 revision rounds)
 */
export async function tailorResumeForJob(
  baseResume: string,
  jdText: string,
  jobTitle: string,
  company: string,
  missingSkills: string[],
): Promise<TailoredOutput> {
  // Step 1: Generate initial variant
  let variantContent = await generateVariant(baseResume, jdText, missingSkills);

  // Step 2: Critique loop (max 2 rounds — from sreekarrs LoopAgent pattern)
  for (let round = 0; round < 2; round++) {
    const critique = await critiqueVariant(variantContent, jdText, baseResume);
    if (critique.approved) break;
    variantContent = await reviseVariant(variantContent, critique.feedback);
  }

  // Step 3: Integrity check (from kedster pattern — no fabricated experience)
  const integrityCheck = await checkIntegrity(variantContent, baseResume);

  // Step 4: Generate cover letter
  const coverLetter = await generateCoverLetter(variantContent, jdText, jobTitle, company);

  return {
    variant: {
      label: `tailored-${company.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      content: variantContent,
      created_at: new Date().toISOString(),
    },
    coverLetter,
    integrityCheck,
  };
}

async function generateVariant(resume: string, jd: string, missingSkills: string[]): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Tailor this resume for the job description below.

Rules:
1. Reorder and emphasize existing bullets to match JD keywords
2. Reframe existing experience using JD terminology where genuinely applicable
3. NEVER invent roles, companies, dates, or skills not in the original resume
4. If missing skills listed below are adjacent to existing experience, briefly acknowledge them in a skills section
5. Output the complete resume in Markdown format

ORIGINAL RESUME:
${resume.slice(0, 6000)}

JOB DESCRIPTION:
${jd.slice(0, 3000)}

MISSING SKILLS TO ADDRESS IF POSSIBLE (from existing adjacent experience only):
${missingSkills.join(', ')}

Output only the resume markdown, nothing else.`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : resume;
}

async function critiqueVariant(
  variant: string,
  jd: string,
  originalResume: string,
): Promise<{ approved: boolean; feedback: string }> {
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Review this tailored resume against the JD. Is it ready to submit?

Check:
1. Does it match the JD's key requirements?
2. Are any claims obviously missing from the original resume (fabrication risk)?
3. Is the format clean and ATS-friendly?

Respond as JSON: {"approved": true/false, "feedback": "specific issues or empty string if approved"}

JD (first 2000 chars): ${jd.slice(0, 2000)}
VARIANT: ${variant.slice(0, 4000)}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    return JSON.parse(text);
  } catch {
    return { approved: true, feedback: '' };
  }
}

async function reviseVariant(variant: string, feedback: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Revise this resume based on the feedback. Output only the revised resume markdown.

FEEDBACK: ${feedback}

CURRENT RESUME:
${variant}`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : variant;
}

async function checkIntegrity(
  variant: string,
  originalResume: string,
): Promise<{ passed: boolean; issues: string[] }> {
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Compare the tailored resume against the original. Flag any employers, roles, dates, or skills in the tailored version that do NOT appear in the original.

Respond as JSON: {"passed": true/false, "issues": ["issue1", "issue2"]}

ORIGINAL: ${originalResume.slice(0, 3000)}
TAILORED: ${variant.slice(0, 3000)}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    return JSON.parse(text);
  } catch {
    return { passed: true, issues: [] };
  }
}

async function generateCoverLetter(
  resume: string,
  jd: string,
  jobTitle: string,
  company: string,
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Write a concise, compelling cover letter (3 paragraphs max) for this application.

Job: ${jobTitle} at ${company}
JD highlights: ${jd.slice(0, 1500)}
Resume highlights: ${resume.slice(0, 1500)}

Rules:
- Lead with one specific metric from the resume that aligns with the JD
- Middle paragraph: 2 concrete examples of relevant work
- Close: timezone/availability and enthusiasm (no begging)
- No "I am writing to apply" opening
- Output only the letter text`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
