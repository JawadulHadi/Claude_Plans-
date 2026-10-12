import pdf from 'pdf-parse';

export interface ParsedResume {
  text: string;
  pageCount: number;
  info: Record<string, unknown>;
}

export async function parsePdfResume(buffer: Buffer): Promise<ParsedResume> {
  const data = await pdf(buffer);
  return {
    text: data.text,
    pageCount: data.numpages,
    info: data.info as Record<string, unknown>,
  };
}

export async function parseTextResume(text: string): Promise<ParsedResume> {
  return { text, pageCount: 1, info: {} };
}
