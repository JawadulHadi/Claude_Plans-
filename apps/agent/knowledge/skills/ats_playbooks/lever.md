# Lever ATS Playbook

## Detection
- URL contains: `lever.co/` or `jobs.lever.co/`

## Form Structure
Lever is a clean single-page form.

### Personal Info
- Name: `input[name="name"]`
- Email: `input[name="email"]`
- Phone: `input[name="phone"]`
- Location: `input[name="location"]`
- LinkedIn: `input[name="urls[LinkedIn]"]`
- Portfolio/GitHub: `input[name="urls[Portfolio]"]` or `input[name="urls[GitHub]"]`

### Resume Upload
- Drop zone: `.resume-upload` or `input[type="file"][name="resume"]`

### Cover Letter
- Textarea: `textarea[name="comments"]` — Lever calls this "Additional Information"

### Custom Questions
- Container: `.application-field` or `.custom-question`
- Each field labeled — match by `label` text

### Submit
- Button: `button[type="submit"]` with text "Submit Application"

## Known Quirks
- Lever autosaves — no need to worry about losing data
- File upload is immediate drag-and-drop (no separate upload button)
- Some Lever forms are embedded in company pages via iframe — detect and switch frame context
- LinkedIn URL field often pre-populates from the URL if the user came from LinkedIn
