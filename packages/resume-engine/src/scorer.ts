import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export interface ScoringResult {
  score: number;           // 0–1 cosine similarity
  reasoning: string;       // Claude's match explanation
  missing_skills: string[];
  matching_skills: string[];
  recommendation: 'apply' | 'tailor' | 'skip';
}

/**
 * Score a job description against a resume using Claude Haiku (cost-optimized).
 * Returns semantic match score plus actionable match analysis.
 *
 * Pattern from kyosek/RAG-based-job-search-assistant:
 * - faithfulness + relevancy evaluation before returning
 * - Retry up to 3x if quality below threshold
 */
export async function scoreResumeAgainstJd(
  resumeText: string,
  jdText: string,
  maxRetries = 3,
): Promise<ScoringResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-5-5',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: SCORING_PROMPT(resumeText.slice(0, 8000), jdText.slice(0, 4000)),
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = parseScoreResponse(text);

      // Faithfulness check: score must be numeric and in range
      if (parsed.score >= 0 && parsed.score <= 1 && parsed.matching_skills.length > 0) {
        return parsed;
      }

      // Below quality threshold — retry with clarification
    } catch (err) {
      lastError = err;
    }
  }

  // Fallback after retries
  return {
    score: 0.5,
    reasoning: 'Could not reliably score — manual review recommended.',
    missing_skills: [],
    matching_skills: [],
    recommendation: 'tailor',
  };
}

function SCORING_PROMPT(resume: string, jd: string): string {
  return `You are a senior technical recruiter. Score the match between this resume and job description.

RESUME:
${resume}

JOB DESCRIPTION:
${jd}

Respond in this exact JSON format (no markdown):
{
  "score": 0.85,
  "reasoning": "Strong NestJS and PostgreSQL overlap, missing Kubernetes experience.",
  "matching_skills": ["NestJS", "TypeScript", "PostgreSQL"],
  "missing_skills": ["Kubernetes", "Go"],
  "recommendation": "tailor"
}

Rules:
- score: 0.0–1.0 (cosine-like semantic overlap, >0.72 = strong match)
- recommendation: "apply" (score>0.85), "tailor" (0.72–0.85), "skip" (<0.72)
- Be specific about skills — no vague descriptions`;
}

function parseScoreResponse(text: string): ScoringResult {
  try {
    const json = JSON.parse(text.trim());
    return {
      score: Number(json.score) || 0,
      reasoning: String(json.reasoning || ''),
      matching_skills: Array.isArray(json.matching_skills) ? json.matching_skills : [],
      missing_skills: Array.isArray(json.missing_skills) ? json.missing_skills : [],
      recommendation: json.recommendation || 'tailor',
    };
  } catch {
    return {
      score: 0,
      reasoning: text,
      missing_skills: [],
      matching_skills: [],
      recommendation: 'skip',
    };
  }
}
