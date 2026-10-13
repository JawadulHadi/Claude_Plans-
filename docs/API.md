# REST API Reference — PitchFire

Base URL: `http://localhost:3001` (local) or `https://api.pitchfire.com` (production)

Interactive docs: `{BASE_URL}/api` (Swagger UI)

---

## Resume

### POST /resume/ingest
Ingest a resume (text or PDF), generate embedding, store in Supabase, trigger job scoring.

**Request body:**
```json
{
  "userId": "string",
  "text": "string (optional — raw resume text)",
  "pdfBase64": "string (optional — base64-encoded PDF)"
}
```

**Response:**
```json
{
  "resumeId": "uuid",
  "embedded": true,
  "jobsQueued": 3
}
```

---

## Jobs

### GET /jobs/matched/:userId
Returns jobs matched for the user's latest resume, ordered by similarity score descending.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Senior Backend Engineer",
    "company": "Stripe",
    "board": "wellfound",
    "url": "https://wellfound.com/jobs/...",
    "location": "Remote",
    "similarity": 0.87
  }
]
```

---

## Apply

### GET /apply/pending/:userId
Returns applications in `pending_review` status with tailored resume preview.

**Response:**
```json
[
  {
    "id": "uuid",
    "status": "pending_review",
    "created_at": "2026-10-12T...",
    "job_listings": {
      "title": "Backend Lead",
      "company": "Acme Corp",
      "board": "remoteok",
      "url": "https://...",
      "location": "Remote"
    },
    "tailor_output": {
      "tailored_resume": "...",
      "cover_letter": "...",
      "score": 0.83
    }
  }
]
```

### POST /apply/:applicationId
Approve or withdraw a pending application.

**Request body:**
```json
{ "action": "approve" }
// or
{ "action": "withdraw" }
```

**Response (approve):**
```json
{
  "success": true,
  "status": "approved",
  "queued": true
}
```

**Response (withdraw):**
```json
{
  "success": true,
  "status": "withdrawn"
}
```

---

## Pipeline

### GET /pipeline/summary/:userId
Returns counts per application status.

**Response:**
```json
{
  "discovered": 12,
  "scored": 8,
  "pending_review": 3,
  "approved": 1,
  "applying": 0,
  "applied": 5,
  "bounced": 1,
  "withdrawn": 2,
  "replied": 2,
  "interview_scheduled": 1
}
```

### GET /pipeline/applications/:userId
Full application list with job details and event log.

**Response:** Array of application objects with nested `job_listings`.

---

## Agents

### POST /agents/trigger
Manually trigger an agent job (dev/admin use).

**Request body:**
```json
{
  "type": "scout",
  "user_id": "string",
  "boards": ["remoteok", "wellfound"]
}
```

```json
{
  "type": "score",
  "user_id": "string",
  "resume_id": "uuid"
}
```

```json
{
  "type": "tailor",
  "application_id": "uuid"
}
```

```json
{
  "type": "apply",
  "application_id": "uuid"
}
```

**Response:**
```json
{ "jobId": "bullmq-job-id", "queued": true }
```

---

## Application Status Values

| Status | Meaning | Set by |
|---|---|---|
| `discovered` | Job found by ScoutAgent | ScoutAgent |
| `scored` | Similarity score calculated | ScorerAgent |
| `pending_review` | Tailored variant ready for user approval | TailorAgent |
| `approved` | User approved, apply job queued | User (POST /apply/:id) |
| `withdrawn` | User withdrew the application | User (POST /apply/:id) |
| `applying` | ApplierAgent is filling the form | ApplierAgent |
| `applied` | Form submitted, confirmation captured | ApplierAgent |
| `bounced` | Apply attempt failed | ApplierAgent |
| `replied` | Employer replied (Phase 3) | InboxAgent |
| `ghosted` | No reply after threshold | InboxAgent |
| `interview_scheduled` | Interview booked (Phase 3) | SchedulerAgent |

---

## Error Responses

All endpoints return standard HTTP status codes:

```json
{ "statusCode": 404, "message": "Application not found", "error": "Not Found" }
{ "statusCode": 400, "message": "action must be approve or withdraw", "error": "Bad Request" }
{ "statusCode": 500, "message": "Internal server error", "error": "Internal Server Error" }
```
