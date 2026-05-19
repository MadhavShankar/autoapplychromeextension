# WisOwl Auto-Apply — Developer Integration Checklist

> This checklist covers everything a developer needs to do to make WisOwl Auto-Apply fully functional in production.

---

## Part A: Supabase Backend Setup

### 1. Database Schema
- [ ] Create a new Supabase project (or use existing)
- [ ] Open SQL Editor → New Query
- [ ] Copy contents of `backend/supabase/schema.sql`
- [ ] Run the SQL script (creates all tables, RLS policies, RPC functions, triggers)
- [ ] Verify tables exist: `profiles`, `experiences`, `education`, `skills`, `job_queue`, `application_results`, `daily_stats`, `ats_mappings`

### 2. Storage Bucket
- [ ] Go to Storage → New Bucket
- [ ] Name: `resumes`
- [ ] Public: **OFF**
- [ ] Add RLS policy: `authenticated users can only access their own files`

### 3. Edge Functions Deployment
- [ ] Install Supabase CLI locally: `npm install -g supabase`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref <your-project-ref>`
- [ ] Deploy all 6 functions:
  ```bash
  supabase functions deploy extension-profile
  supabase functions deploy extension-job-queue
  supabase functions deploy extension-resume-url
  supabase functions deploy extension-llm-assist
  supabase functions deploy extension-result
  supabase functions deploy extension-session-end
  ```
- [ ] Set secrets for Edge Functions:
  ```bash
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
  ```
- [ ] Verify endpoints are reachable:
  ```bash
  curl https://<project-ref>.supabase.co/functions/v1/extension-profile \
    -H "Authorization: Bearer <test-jwt>"
  ```

### 4. API URL Configuration
- [ ] In `lib/config.ts`, update `apiBaseUrl` to your Supabase Functions URL:
  ```ts
  apiBaseUrl: 'https://<project-ref>.supabase.co/functions/v1'
  ```

---

## Part B: Digital Ocean Worker (Pre-Generation)

### 5. Deploy Pre-Generation Service
- [ ] Create a new Digital Ocean App (or Function)
- [ ] Upload `backend/do-worker/` folder
- [ ] Set environment variables:
  ```
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
  ANTHROPIC_API_KEY=sk-ant-api03-...
  ```
- [ ] Configure cron trigger (nightly at 2 AM UTC recommended)
- [ ] Alternatively, use DO Functions with scheduled triggers
- [ ] Run manual test: `npm install && npm start` locally to verify connectivity

---

## Part C: Chrome Extension Setup

### 6. Extension ID & Manifest
- [ ] Load extension as "unpacked" in `chrome://extensions/` (Developer mode ON)
- [ ] Note the Extension ID (32-character string)
- [ ] In `backend/web-app/AuthHandoff.tsx`, replace placeholder Extension ID:
  ```tsx
  const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
  ```
- [ ] In `public/manifest.json`, verify `externally_connectable` matches your web app domain:
  ```json
  "externally_connectable": {
    "matches": ["https://app.wisowl.com/*"]
  }
  ```

### 7. Build & Test Extension
- [ ] Install dependencies: `npm install`
- [ ] Build: `npm run build`
- [ ] Load `dist/` folder as unpacked extension
- [ ] Verify popup opens without errors
- [ ] Check background service worker is active (chrome://extensions/ → Details → Service Worker)

---

## Part D: WisOwl Web App Integration

### 8. Auth Handoff Component
- [ ] Copy `backend/web-app/AuthHandoff.tsx` into your Next.js/React app
- [ ] Import and render `<AuthHandoff supabaseSession={session} />` on the dashboard
- [ ] Ensure your web app runs on `https://app.wisowl.com/*` (or update manifest + worker.ts origin check)
- [ ] Test auth flow:
  1. Log in to web app
  2. Extension should auto-detect and receive JWT
  3. Popup should switch from "Connect" to "Ready" view

### 9. Job Queue Population
- [ ] Implement your job matching algorithm that writes to `job_queue` table
- [ ] Ensure `match_score` is either `'high'` or `'medium'`
- [ ] Ensure `already_applied` defaults to `false`
- [ ] Set `valid_until` to `now() + interval '7 days'`
- [ ] Verify the pre-generation worker populates `pregenerated` JSONB column

---

## Part E: User Profile Data Flow

### 10. Profile Sync
- [ ] When a user completes onboarding in your web app, write to:
  - `profiles` (personal info, resume metadata)
  - `experiences` (work history)
  - `education` (degrees)
  - `skills` (flat skill list)
- [ ] Upload resume PDF to Supabase Storage bucket `resumes`
  - Path format recommended: `<user_id>/resume.pdf`
  - Store path in `profiles.resume_storage_path`
- [ ] Store resume text extraction in `profiles.resume_text_content` (used by pre-generation worker)

---

## Part F: End-to-End Testing

### 11. Manual Test Flow
- [ ] Open Chrome DevTools → Extensions → Service Worker → Console
- [ ] In web app, verify extension shows "Installed" in AuthHandoff component
- [ ] Click "Sync Auth Token" → check worker console for "Token received and stored"
- [ ] In extension popup, click "Start Session"
- [ ] Verify worker fetches profile + job queue + resume URL
- [ ] Watch tabs open/close automatically for each job
- [ ] Check `application_results` table in Supabase for logged outcomes
- [ ] Verify `daily_stats` updates after each application

### 12. Test Against Real ATS Forms
- [ ] Greenhouse: `boards.greenhouse.io` — fill + submit test
- [ ] Lever: `jobs.lever.co` — fill + submit test
- [ ] Workday: `myworkdayjobs.com` — fill test (may need review for iFrames)
- [ ] LinkedIn Easy Apply: `linkedin.com/jobs` — click Easy Apply + fill modal test
- [ ] Generic/custom forms — fill test

---

## Part G: Production Hardening

### 13. Security Checklist
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` and store in DO secrets (not env vars)
- [ ] Rotate `ANTHROPIC_API_KEY` and store in Supabase secrets + DO secrets
- [ ] Verify no API keys exist in any committed code
- [ ] Verify `extension_id` is not hardcoded in backend code
- [ ] Enable Supabase RLS on all tables (already in schema.sql)
- [ ] Enable HTTPS-only on web app and Supabase project

### 14. Monitoring & Alerts
- [ ] Add logging/monitoring to Edge Functions (Supabase Dashboard → Logs)
- [ ] Monitor DO Worker execution logs
- [ ] Set up alerts for:
  - Edge Function 5xx errors
  - DO Worker failures
  - High `failed` or `needs_review` rates in `daily_stats`

### 15. Chrome Web Store Submission
- [ ] Generate icons: `icon16.png`, `icon48.png`, `icon128.png` (place in `public/`)
- [ ] Build production bundle: `npm run build`
- [ ] Zip the `dist/` folder
- [ ] Submit to Chrome Web Store Developer Dashboard
- [ ] Note the **published Extension ID** (may differ from unpacked ID)
- [ ] Update `AuthHandoff.tsx` with published Extension ID
- [ ] Update `externally_connectable` in manifest if domain changes

---

## Part H: Known Limitations (P2)

- [ ] **Cross-origin iFrames:** Workday, Taleo, SAP SuccessFactors may show `IFRAME_BLOCKED` → `needs_review`. This is expected; true cross-origin automation requires iFrame bridge improvements.
- [ ] **LinkedIn Easy Apply:** Modal detection depends on LinkedIn DOM stability. Monitor and update selectors if LinkedIn changes markup.
- [ ] **Naukri/Indeed:** Heavy bot detection; expect higher `needs_review` rates.
- [ ] **Pre-generation cost:** Claude Sonnet API costs scale with job queue size. Adjust nightly batch size if needed.

---

## Quick Reference: File Locations

| Component | Path |
|-----------|------|
| Supabase Schema | `backend/supabase/schema.sql` |
| Edge Functions | `backend/supabase/functions/*/` |
| DO Worker | `backend/do-worker/pre-generation-service.ts` |
| Web App Auth Handoff | `backend/web-app/AuthHandoff.tsx` |
| Extension Config | `lib/config.ts` |
| Extension Manifest | `public/manifest.json` |

---

*Checklist version: 1.0 · Generated for WisOwl Auto-Apply Backend + P2 Release*
