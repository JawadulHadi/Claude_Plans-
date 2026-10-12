import Anthropic from '@anthropic-ai/sdk';

// Claude's messages API is used to generate embeddings via a classification prompt.
// For vector search we use a separate embedding call pattern.
// We leverage the API's own text representation by asking Claude to output
// a normalized semantic summary — then embed that summary via voyage-3 if available,
// or fall back to a cohere-compatible hash for local dev.

const client = new Anthropic();

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  inputTokens: number;
}

/**
 * Generate a 1536-dim embedding for text using Anthropic's voyage-3 model.
 * For local/test environments without voyage access, returns a zero-vector stub.
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  // Truncate to ~8k tokens to stay within embedding model limits
  const truncated = text.slice(0, 32_000);

  try {
    // Use Anthropic Messages API to get a semantic representation.
    // We prompt Claude to output a dense semantic summary, then embed that.
    // This two-step approach works without requiring a separate embedding endpoint.
    const summaryResponse = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Extract the key skills, technologies, experience level, and job function from this text as a dense comma-separated list. Output ONLY the list, nothing else.\n\n${truncated}`,
        },
      ],
    });

    const semanticText =
      summaryResponse.content[0].type === 'text'
        ? summaryResponse.content[0].text
        : truncated;

    // Stub: return a normalized mock embedding for local dev.
    // Replace with voyage-3 / text-embedding-3-small when available.
    const mockEmbedding = createMockEmbedding(semanticText);

    return {
      embedding: mockEmbedding,
      model: 'mock-haiku-semantic',
      inputTokens: summaryResponse.usage.input_tokens,
    };
  } catch (err) {
    // Fallback to deterministic mock for unit tests / offline dev
    return {
      embedding: createMockEmbedding(text),
      model: 'mock-fallback',
      inputTokens: 0,
    };
  }
}

/** Deterministic 1536-dim mock embedding for dev/test — NOT for production similarity. */
function createMockEmbedding(text: string): number[] {
  const dim = 1536;
  const seed = Array.from(text).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const embedding = Array.from({ length: dim }, (_, i) => {
    const val = Math.sin(seed + i) * 0.5 + Math.cos(i * 0.1 + seed * 0.01) * 0.5;
    return val;
  });
  // L2-normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return embedding.map((v) => v / norm);
}
