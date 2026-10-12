# Greenhouse ATS Playbook

## Detection
- URL contains: `greenhouse.io` or `boards.greenhouse.io` or `job-boards.greenhouse.io`

## Form Structure
Greenhouse is a single-page form with sections.

### Personal Info
- First Name: `#first_name`
- Last Name: `#last_name`
- Email: `#email`
- Phone: `#phone`
- Location: `#job_application_location`

### Resume Upload
- File input: `input#resume` or `input[name="resume"]`
- Alternative: paste resume text in `#resume_text`

### Cover Letter
- File: `input#cover_letter` (optional)
- Text: `#cover_letter_text`

### LinkedIn / Portfolio
- LinkedIn: `input[name*="linkedin"]` — look for label containing "LinkedIn"
- Website/Portfolio: `input[name*="website"]` or `input[name*="portfolio"]`

### Custom Questions
- Container: `.custom-field` or `[class*="question"]`
- Each has a label + input/textarea/select

### Submit
- Button: `#submit_app` or `input[type="submit"][value*="Submit"]`

## Known Quirks
- Greenhouse sometimes has a CAPTCHA on final submit — detect with `iframe[src*="recaptcha"]`
- File upload shows progress bar — wait for it to reach 100% 
- Custom questions can include required dropdowns — match by visible label text
- Some companies add work authorization questions — answer "Yes" for US citizens/authorized
