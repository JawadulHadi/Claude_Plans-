import Anthropic from '@anthropic-ai/sdk';

export const MODELS = {
  FAST:    'claude-haiku-5-5',    // classification, routing, inbox
  QUALITY: 'claude-sonnet-4-6',   // tailoring, coaching, user-visible
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

const RETRYABLE_HTTP = new Set([429, 500, 529]);

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; agentName?: string } = {},
): Promise<T> {
  const { maxAttempts = 3, agentName = 'agent' } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const retryable = status !== undefined && RETRYABLE_HTTP.has(status);
      if (!retryable || attempt === maxAttempts) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      process.stderr.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          agent: agentName,
          msg: `Claude API ${status} — retrying`,
          attempt,
          max_attempts: maxAttempts,
          delay_ms: delayMs,
        }) + '\n',
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}

export function logTokens(
  agent: string,
  model: string,
  usage: Anthropic.Usage,
  operation: string,
): void {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      agent,
      msg: 'token_usage',
      model,
      operation,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
    }) + '\n',
  );
}
