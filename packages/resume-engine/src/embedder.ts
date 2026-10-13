import VoyageAI from 'voyageai';

const voyage = new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY ?? '' });

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  inputTokens: number;
}

/**
 * Generate a 1024-dim embedding using voyage-3-lite.
 * Falls back to a deterministic stub when VOYAGE_API_KEY is absent (local dev / CI).
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const truncated = text.slice(0, 16_000);

  if (!process.env.VOYAGE_API_KEY) {
    return { embedding: mockEmbedding(truncated), model: 'mock-dev', inputTokens: 0 };
  }

  try {
    const result = await voyage.embed({
      input: [truncated],
      model: 'voyage-3-lite',
    });

    const vec = result.data?.[0]?.embedding;
    if (!vec) throw new Error('voyage returned empty embedding');

    return {
      embedding: vec,
      model: 'voyage-3-lite',
      inputTokens: result.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    console.error('[Embedder] voyage-3-lite failed, using dev fallback:', (err as Error).message);
    return { embedding: mockEmbedding(truncated), model: 'mock-fallback', inputTokens: 0 };
  }
}

/** Deterministic 1024-dim stub for dev/test — NOT for production similarity. */
function mockEmbedding(text: string): number[] {
  const dim = 1024;
  const seed = Array.from(text).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const vec = Array.from({ length: dim }, (_, i) =>
    Math.sin(seed + i) * 0.5 + Math.cos(i * 0.1 + seed * 0.01) * 0.5,
  );
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / norm);
}
