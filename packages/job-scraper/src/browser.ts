import { chromium, type Browser, type BrowserContext } from 'playwright';
import { randomInt } from 'crypto';

// Playwright pre-installed in CCR environment at /opt/pw-browsers
const BROWSER_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? undefined  // Let Playwright find it via env var
  : '/opt/pw-browsers/chromium';

// Anti-detection user agents (from sreekarrs pattern)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London'];

export async function createStealthBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
    ],
  });
}

export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
  const userAgent = USER_AGENTS[randomInt(USER_AGENTS.length)];
  const timezone = TIMEZONES[randomInt(TIMEZONES.length)];

  const context = await browser.newContext({
    userAgent,
    timezoneId: timezone,
    locale: 'en-US',
    viewport: { width: 1280 + randomInt(200), height: 800 + randomInt(200) },
    // Mask WebGL fingerprint (from sreekarrs pattern)
    javaScriptEnabled: true,
  });

  // Override navigator.webdriver to evade bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  return context;
}

export function randomDelay(minMs = 1000, maxMs = 3000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, minMs + randomInt(maxMs - minMs)));
}
