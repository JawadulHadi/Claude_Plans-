# Workday ATS Playbook

## Detection
- URL contains: `myworkdayjobs.com` or `wd1.myworkdaysite.com` or `wd3.myworkdaysite.com`
- Page title contains "Workday"

## Form Structure
Workday is a multi-step wizard. Each step must be completed before advancing.

### Step 1: My Information
- First Name: `input[data-automation-id="legalNameSection_firstName"]`
- Last Name: `input[data-automation-id="legalNameSection_lastName"]`  
- Email: `input[data-automation-id="email"]`
- Phone: `input[data-automation-id="phone-number"]`

### Step 2: My Experience
- Resume upload: `input[type="file"]` inside the resume section
- Wait for upload confirmation before proceeding

### Step 3: Application Questions
- Radio/checkbox fields vary per company
- Look for `[data-automation-id*="questionnaire"]` containers

### Step 4: Review
- Final submit button: `button[data-automation-id="bottom-navigation-next-button"]`

## Navigation
- Next button: `button[data-automation-id="bottom-navigation-next-button"]`
- Previous: `button[data-automation-id="bottom-navigation-previous-button"]`
- Save for later: `button[data-automation-id="bottom-navigation-save-continue-button"]`

## Known Quirks
- Workday uses heavy Angular — always wait for `networkidle` after each click
- File upload spinner can take 10-30s — poll for `[data-automation-id="resume-section"] .file-name`
- Some Workday instances require LinkedIn URL in step 1
- EEO questions on last step — use "Decline to Self Identify" safely
