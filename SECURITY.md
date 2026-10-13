# Security Policy

## Supported Versions

PitchFire is under active development. The table below shows which versions receive security fixes.

| Version / Phase | Status |
|---|---|
| Phase 3+ (`main`) | ✅ Actively maintained |
| Phase 1–2 (historical) | ❌ No longer patched |

We recommend running from the `main` branch or the latest tagged release.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities by emailing:

📧 **jawadulhadicc@gmail.com**

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We aim to acknowledge reports within **48 hours** and provide a fix timeline within **7 days** for critical issues.

---

## Known Security Considerations

### Credentials & API Keys
- **Never commit secrets.** `.env.example` shows the required keys; actual values live in `.env.local` (gitignored).
- `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` are server-only — never expose to the client.
- `SUPABASE_ANON_KEY` is safe to expose client-side (Supabase RLS enforces data isolation).

### OAuth Tokens
- `GMAIL_ACCESS_TOKEN` and `GOOGLE_CALENDAR_ACCESS_TOKEN` are per-user short-lived tokens stored in Supabase (not in `.env`). They are loaded at agent runtime, never logged.
- Use the Google OAuth PKCE flow for production; the dev shortcut of injecting a static token is for local testing only.

### Playwright / Browser Automation
- The `ApplierAgent` submits forms on behalf of users. Every application requires **explicit user approval** before Playwright acts (`POST /apply/:applicationId { action: "approve" }`). No application is ever submitted without a user sign-off.
- Persistent browser profiles at `~/.pitchfire/browser_profiles/` contain site cookies and sessions — treat them as sensitive credentials. Do not commit or share this directory.

### Supabase Row-Level Security
- All tables should have RLS enabled with policies that scope reads/writes to the authenticated user's `id`. Verify policies after schema migrations with `supabase db lint`.
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — only used server-side in NestJS services, never in Next.js client code.

### BullMQ / Redis
- The Redis instance holds job queues and the DLQ (`pitchfire:dlq`). DLQ payloads may contain resume text and PII — treat the Redis instance as sensitive data.
- Use `REDIS_URL` with TLS in production (e.g. Upstash provides TLS by default). Never expose Redis publicly.

### Input Validation
- All API endpoints validate request bodies with Zod schemas via `class-validator` / NestJS pipes.
- Resume text is truncated to 16 000 chars before embedding to prevent prompt-injection-via-resume attacks in the scoring pipeline.

### Multi-Tenant / Agency Mode (Phase 5)
- Agency-mode users will be able to manage multiple job-seeker profiles. Ensure strict `user_id` isolation in all Supabase queries — never allow cross-tenant reads. This will be enforced at the database level (RLS) and the API level (controller guards).

---

## Dependency Vulnerabilities

GitHub Dependabot is enabled on this repository. PRs for dependency upgrades are reviewed and merged on a rolling basis. Run `pnpm audit` locally to surface known CVEs in direct dependencies.

---

## Disclosure Policy

This project follows **responsible disclosure**. We ask that researchers:
1. Report privately first (see above)
2. Allow us reasonable time to patch before public disclosure
3. Avoid accessing user data or disrupting service during testing

We credit researchers in the changelog when a fix is shipped (with their consent).
