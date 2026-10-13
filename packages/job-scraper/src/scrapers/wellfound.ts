import type { JobListing } from '@pitchfire/shared';
import { createStealthBrowser, createStealthContext, randomDelay } from '../browser.js';

export async function scrapeWellfound(
  keywords: string[],
  limit = 20,
): Promise<Partial<JobListing>[]> {
  const browser = await createStealthBrowser();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  const results: Partial<JobListing>[] = [];

  try {
    const searchQuery = keywords.join('-').toLowerCase();
    await page.goto(
      `https://wellfound.com/jobs?role=${encodeURIComponent(keywords[0] ?? 'engineer')}&remote=true`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    );

    await randomDelay();

    // Wait for job cards to load
    await page.waitForSelector('[data-test="StartupResult"]', { timeout: 15_000 }).catch(() => {});

    const jobCards = await page.$$('[data-test="StartupResult"]');

    for (const card of jobCards.slice(0, limit)) {
      try {
        const title = await card.$eval('a[data-test="job-title"]', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const company = await card.$eval('[data-test="company-name"]', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const url = await card.$eval('a[data-test="job-title"]', (el) => (el as HTMLAnchorElement).href).catch(() => '');

        if (!title || !url) continue;

        results.push({
          title,
          company,
          location: 'Remote',
          remote_ok: true,
          board: 'wellfound',
          external_id: url.split('/').pop() ?? '',
          url,
          jd_text: '',   // fetched lazily when needed
          scraped_at: new Date().toISOString(),
        });

        await randomDelay(500, 1500);
      } catch {
        // skip malformed card
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
}
