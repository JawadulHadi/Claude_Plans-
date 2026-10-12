import type { JobListing, JobBoard } from '@jobpilot/shared';
import { scrapeRemoteOk } from './scrapers/remoteok.js';
import { scrapeWellfound } from './scrapers/wellfound.js';

export interface ScraperOptions {
  keywords: string[];
  boards?: JobBoard[];
  limit?: number;
}

export interface ScrapeResult {
  jobs: Partial<JobListing>[];
  errors: Array<{ board: string; error: string }>;
}

const SCRAPERS: Partial<Record<JobBoard, (keywords: string[], limit?: number) => Promise<Partial<JobListing>[]>>> = {
  remoteok: scrapeRemoteOk,
  wellfound: scrapeWellfound,
};

/**
 * Scrape multiple job boards concurrently (conveyor belt pattern from kedster).
 * Errors from one board don't block others.
 */
export async function scrapeJobs(options: ScraperOptions): Promise<ScrapeResult> {
  const { keywords, boards = ['remoteok', 'wellfound'], limit = 20 } = options;

  const tasks = boards
    .filter((board) => board in SCRAPERS)
    .map(async (board) => {
      try {
        const scraper = SCRAPERS[board]!;
        const jobs = await scraper(keywords, limit);
        return { board, jobs, error: null };
      } catch (err) {
        return { board, jobs: [], error: String(err) };
      }
    });

  const results = await Promise.allSettled(tasks);

  const jobs: Partial<JobListing>[] = [];
  const errors: Array<{ board: string; error: string }> = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      jobs.push(...result.value.jobs);
      if (result.value.error) {
        errors.push({ board: result.value.board, error: result.value.error });
      }
    }
  }

  return { jobs, errors };
}

export { scrapeRemoteOk, scrapeWellfound };
