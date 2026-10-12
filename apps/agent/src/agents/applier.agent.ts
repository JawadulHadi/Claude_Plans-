import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getApplicationWithDetails, storeAppliedConfirmation, recordTransition } from '@jobpilot/pipeline-tracker';

const BROWSER_PROFILES_DIR = join(process.env.HOME || '/root', '.jobpilot', 'browser_profiles');
const PLAYWRIGHT_EXECUTABLE =
  process.env.PLAYWRIGHT_BROWSERS_PATH
    ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
    : '/opt/pw-browsers/chromium';

const client = new Anthropic();

export interface ApplierInput {
  application_id: string;
}

export interface ApplierResult {
  success: boolean;
  confirmation_url?: string;
  confirmation_text?: string;
  error?: string;
  ats_type?: string;
}

type AtsType = 'workday' | 'greenhouse' | 'lever' | 'ashby' | 'generic';

function detectAts(url: string): AtsType {
  if (/myworkdayjobs\.com|myworkdaysite\.com/.test(url)) return 'workday';
  if (/greenhouse\.io/.test(url)) return 'greenhouse';
  if (/lever\.co/.test(url)) return 'lever';
  if (/ashbyhq\.com/.test(url)) return 'ashby';
  return 'generic';
}

function loadAtsPlaybook(atsType: AtsType): string {
  const playbookPath = join(
    __dirname,
    '../../knowledge/skills/ats_playbooks',
    `${atsType}.md`,
  );
  if (existsSync(playbookPath)) {
    return readFileSync(playbookPath, 'utf-8');
  }
  return '';
}

function getProfilePath(userId: string): string {
  const profileDir = join(BROWSER_PROFILES_DIR, userId);
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

async function createBrowser(userId: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const profilePath = getProfilePath(userId);

  const browser = await chromium.launch({
    executablePath: existsSync(PLAYWRIGHT_EXECUTABLE) ? PLAYWRIGHT_EXECUTABLE : undefined,
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    storageState: existsSync(join(profilePath, 'state.json'))
      ? join(profilePath, 'state.json')
      : undefined,
  });

  // Override automation detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });

  return { browser, context };
}

async function saveProfile(context: BrowserContext, userId: string): Promise<void> {
  const profilePath = getProfilePath(userId);
  await context.storageState({ path: join(profilePath, 'state.json') });
}

async function fillFormWithClaude(
  page: Page,
  applicationData: {
    jobTitle: string;
    company: string;
    jobDescription: string;
    resumeVariant: string;
    coverLetter: string;
    userProfile: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      location: string;
      linkedin?: string;
    };
  },
  atsType: AtsType,
  atsPlaybook: string,
): Promise<{ success: boolean; actions: string[] }> {
  const pageContent = await page.evaluate(() => document.body.innerText);
  const pageHtml = await page.evaluate(() => document.body.innerHTML);

  const systemPrompt = `You are an expert job application form-filler. You analyze job application forms and determine the exact actions needed to fill them out correctly.

${atsPlaybook ? `## ATS Playbook for ${atsType}:\n${atsPlaybook}` : ''}

You must respond with a JSON array of actions. Each action has:
- type: "fill" | "click" | "select" | "upload" | "wait"
- selector: CSS selector or data-automation-id
- value: the value to fill/select (for fill/select actions)
- description: what this action does

Only include actions for fields that exist on the page. Skip optional fields unless you have data for them.`;

  const userMessage = `Fill out this ${atsType} job application form.

## Job Details
Title: ${applicationData.jobTitle}
Company: ${applicationData.company}

## Candidate Profile
First Name: ${applicationData.userProfile.firstName}
Last Name: ${applicationData.userProfile.lastName}
Email: ${applicationData.userProfile.email}
Phone: ${applicationData.userProfile.phone}
Location: ${applicationData.userProfile.location}
LinkedIn: ${applicationData.userProfile.linkedin ?? 'N/A'}

## Page Text (truncated):
${pageContent.slice(0, 3000)}

## Page HTML (truncated for field detection):
${pageHtml.slice(0, 4000)}

Respond with a JSON array of actions to fill this form. Be specific with selectors.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== 'text') return { success: false, actions: [] };

  // Extract JSON from response
  const jsonMatch = content.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return { success: false, actions: [] };

  let actions: Array<{ type: string; selector: string; value?: string; description: string }>;
  try {
    actions = JSON.parse(jsonMatch[0]);
  } catch {
    return { success: false, actions: [] };
  }

  const executedActions: string[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'fill' && action.value) {
        await page.fill(action.selector, action.value);
        executedActions.push(`Filled: ${action.description}`);
      } else if (action.type === 'click') {
        await page.click(action.selector);
        executedActions.push(`Clicked: ${action.description}`);
        await page.waitForTimeout(500);
      } else if (action.type === 'select' && action.value) {
        await page.selectOption(action.selector, action.value);
        executedActions.push(`Selected: ${action.description}`);
      } else if (action.type === 'wait') {
        await page.waitForTimeout(2000);
        executedActions.push(`Waited: ${action.description}`);
      }
    } catch (err) {
      // Field may not exist on this specific form — continue
      executedActions.push(`Skipped (not found): ${action.description}`);
    }
  }

  return { success: true, actions: executedActions };
}

async function uploadResumeFile(page: Page, resumeText: string): Promise<boolean> {
  // Write resume to temp file for upload
  const tempPath = join('/tmp', `resume-${Date.now()}.txt`);
  writeFileSync(tempPath, resumeText);

  try {
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(tempPath);
      await page.waitForTimeout(3000); // wait for upload
      return true;
    }
  } catch {
    // no file input found
  }
  return false;
}

export async function runApplierAgent(input: ApplierInput): Promise<ApplierResult> {
  const { application_id } = input;

  // Fetch full application details
  const appData = await getApplicationWithDetails(application_id);
  if (!appData) {
    return { success: false, error: 'Application not found' };
  }

  const { job, resume } = appData as {
    job: { title: string; company: string; url: string; jd_text: string };
    resume: { content_text: string; variants: Array<{ cover_letter: string; tailored_resume: string }> };
  };

  if (!job?.url) {
    return { success: false, error: 'No job URL found' };
  }

  // Get the tailored variant (first one, or base resume)
  const variant = resume?.variants?.[0];
  const resumeText = variant?.tailored_resume ?? resume?.content_text ?? '';
  const coverLetter = variant?.cover_letter ?? '';

  const atsType = detectAts(job.url);
  const atsPlaybook = loadAtsPlaybook(atsType);

  // Mark as applying
  await recordTransition(application_id, 'approved', 'applying', { ats_type: atsType });

  // Get user profile from env or defaults (Phase 5: pull from Supabase users table)
  const userProfile = {
    firstName: process.env.USER_FIRST_NAME ?? 'Jawad',
    lastName: process.env.USER_LAST_NAME ?? 'Ul Hadi',
    email: process.env.USER_EMAIL ?? 'jawadulhadicc@gmail.com',
    phone: process.env.USER_PHONE ?? '',
    location: process.env.USER_LOCATION ?? 'Remote',
    linkedin: process.env.USER_LINKEDIN,
  };

  const userId = appData.user_id as string;

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    ({ browser, context } = await createBrowser(userId));
    const page = await context.newPage();

    // Navigate to job application
    await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30000 });

    // Upload resume file if possible
    await uploadResumeFile(page, resumeText);

    // Fill form with Claude's guidance
    const { success, actions } = await fillFormWithClaude(
      page,
      {
        jobTitle: job.title,
        company: job.company,
        jobDescription: job.jd_text,
        resumeVariant: resumeText,
        coverLetter,
        userProfile,
      },
      atsType,
      atsPlaybook,
    );

    if (!success) {
      await browser.close();
      return { success: false, error: 'Failed to fill form', ats_type: atsType };
    }

    console.log(`[applier] Executed ${actions.length} form actions for ${job.company}`);

    // Capture confirmation
    const confirmationUrl = page.url();
    const confirmationText = await page.evaluate(() => document.body.innerText.slice(0, 500));

    // Save browser profile for future runs
    await saveProfile(context, userId);
    await browser.close();

    // Record successful application
    await storeAppliedConfirmation(application_id, confirmationUrl, confirmationText);

    return {
      success: true,
      confirmation_url: confirmationUrl,
      confirmation_text: confirmationText,
      ats_type: atsType,
    };
  } catch (err) {
    try { await browser?.close(); } catch { /* ignore */ }

    const errorMessage = err instanceof Error ? err.message : String(err);
    await recordTransition(application_id, 'applying', 'bounced', { error: errorMessage });

    return { success: false, error: errorMessage, ats_type: atsType };
  }
}
