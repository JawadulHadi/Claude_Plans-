import type { JobListing } from '@pitchfire/shared';

// RemoteOK provides a public JSON API — no Playwright needed
// https://remoteok.com/api

interface RemoteOkJob {
  id: string;
  position: string;
  company: string;
  location: string;
  url: string;
  description: string;
  tags: string[];
  salary_min?: number;
  salary_max?: number;
  date: string;
}

export async function scrapeRemoteOk(keywords: string[]): Promise<Partial<JobListing>[]> {
  const response = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'PitchFire-Bot/1.0 (job search aggregator)' },
  });

  if (!response.ok) {
    throw new Error(`RemoteOK API error: ${response.status}`);
  }

  const data = (await response.json()) as RemoteOkJob[];
  const jobs = data.filter((item) => item.position); // first item is metadata

  const keywordLower = keywords.map((k) => k.toLowerCase());

  return jobs
    .filter((job) => {
      const text = `${job.position} ${job.description} ${job.tags?.join(' ')}`.toLowerCase();
      return keywordLower.some((kw) => text.includes(kw));
    })
    .map((job) => ({
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      remote_ok: true,
      board: 'remoteok' as const,
      external_id: String(job.id),
      url: job.url || `https://remoteok.com/l/${job.id}`,
      jd_text: job.description || '',
      salary_min: job.salary_min ?? null,
      salary_max: job.salary_max ?? null,
      salary_currency: 'USD',
      scraped_at: new Date().toISOString(),
    }));
}
