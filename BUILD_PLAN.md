# WisOwl Auto-Apply — Chrome Extension Build Plan

> Derived from `wisowl-autoapply-prd-final.html` (PRD Final v2.0 · May 2025)

---

## 1 · Executive Summary

This plan translates the PRD into an actionable, phased implementation roadmap. The extension is a **Manifest V3 Chrome Extension** built with **TypeScript + Vite + Vanilla DOM**. It automates job application form filling on company career pages by orchestrating a background service worker, per-tab content scripts, and a popup UI.

**Blocking dependency:** The WisOwl backend must ship three endpoints before any extension code can run:
- `GET /extension/profile`
- `GET /extension/job-queue`
- `GET /extension/resume-url`

---

## 2 · Build Phases Overview

| Phase | Focus | Estimated Effort | Deliverable |
|-------|-------|------------------|-------------|
| **Phase 0** | Foundation & Infrastructure | 2 days | Project scaffold, build pipeline, types, storage layer |
| **Phase 1** | Core Engine — Background Worker | 3 days | Session lifecycle, API client, tab orchestration, keepalive |
| **Phase 2** | Form Automation — Content Scripts | 5 days | Field detection, mapping, filling, resume upload, submit handler |
| **Phase 3** | ATS Detection & Strategies | 3 days | Detector + 7 strategy modules (generic fallback) |
| **Phase 4** | Popup UI | 2 days | All 6 views (Auth → Summary), live log, state-driven rendering |
| **Phase 5** | Integration, Reliability & Polish | 3 days | Error handling, state machine, anti-detection, MV3 restart resilience |
| **Phase 6** | Testing & QA | 3 days | Unit tests, manual ATS form testing, end-to-end session testing |
| **Phase 7** | Packaging & Distribution | 1 day | Build scripts, Chrome Web Store assets, documentation |

**Total estimated effort: ~19 engineering days**

---

## 3 · Phase 0 — Foundation & Infrastructure

### 3.1 Goals
- Working Vite build pipeline that emits MV3-compatible bundles
- Strict TypeScript configuration
- All shared types defined and type-safe
- Storage abstraction that survives service worker restarts
- Message-passing contracts between worker ↔ content ↔ popup

### 3.2 Tasks

```
□ Initialize npm project with Vite + @crxjs/vite-plugin (or raw Vite + manual manifest)
□ Configure tsconfig.json (strict: true, esModuleInterop, DOM + WebExtension types)
□ Configure vite.config.ts with multiple entry points:
   - background/worker.ts  → dist/background/worker.js
   - content/form-agent.ts → dist/content/form-agent.js
   - popup/index.html      → dist/popup/
□ Create types/index.ts — all shared interfaces from PRD §06
□ Create lib/storage.ts — typed chrome.storage.local wrapper
□ Create lib/messages.ts — typed message definitions + send/recv helpers
□ Create lib/wait.ts — waitForElement, waitForCondition, delay
□ Create lib/utils.ts — normalize strings, randomDelay, fuzzy label matching
□ Add manifest.json (PRD §09) to public/ or build output
□ Verify build produces loadable unpacked extension in Chrome
```

### 3.3 Key Decisions
- **Bundler:** Vite with multiple `build.lib` entries. CRXJS is optional but can simplify HMR; for production stability, manual multi-entry Vite is preferred.
- **No frameworks in popup:** Vanilla DOM + scoped CSS to keep bundle < 200 KB.
- **Type safety:** All `chrome.runtime.sendMessage` calls use typed wrappers in `lib/messages.ts`.

---

## 4 · Phase 1 — Core Engine (Background Service Worker)

### 4.1 Goals
- Orchestrate full session lifecycle from auth to completion
- Make all WisOwl API calls with JWT auth, retries, and 401 handling
- Manage tab lifecycle: open → inject → listen → close → next
- Implement MV3 keepalive alarm to prevent worker termination
- Recover gracefully from worker restarts by reading `chrome.storage.local`

### 4.2 Tasks

```
□ Implement api/wisowl.ts — typed wrappers for all 6 endpoints (PRD §07)
□ Implement background/worker.ts:
   □ onMessageExternal handler for auth token handoff from app.wisowl.com
   □ Session initialization: profile → job-queue → resume-url (parallel where possible)
   □ Job iteration loop with 2–5s random inter-job delay
   □ Tab open/inject/close orchestration via chrome.scripting.executeScript
   □ Keepalive alarm (periodInMinutes: 0.4) during active sessions
   □ Restart-resilience: on startup, read storage; if session was RUNNING, resume
   □ LLM_ASSIST_REQUEST routing to POST /extension/llm-assist
   □ Result logging to POST /extension/result (immediate, no batching)
   □ Session-end POST on completion / error
□ Implement SessionState machine transitions (PRD §20)
□ Implement error handling: AUTH_EXPIRED → ERROR state, API_FAIL → retry 3×
□ Implement NETWORK_OFFLINE detection + auto-resume polling
```

### 4.3 Architecture Notes
- All session state lives in `chrome.storage.local`. In-memory caches are rebuilt on worker restart.
- The worker is the **single source of truth** for session progress. Content scripts and popup are stateless consumers.
- Use `chrome.alarms` (not `setInterval`) for keepalive — MV3 compliant.

---

## 5 · Phase 2 — Form Automation (Content Scripts)

### 5.1 Goals
- Detect, map, and fill every field type on arbitrary career pages
- Handle resume upload across all 4 scenarios (native, React/Angular, drag-drop, async)
- Support multi-page forms, dynamic conditional fields, and custom dropdowns
- Detect CAPTCHA pre-fill and post-submit
- Return structured `ApplicationRecord` to the worker

### 5.2 Tasks

```
□ content/form-agent.ts — entry point orchestrator:
   □ Receives job data + profile from worker via sendMessage
   □ Waits for DOM ready (max 5s)
   □ Delegates to ATS strategy → field-detector → field-mapper → field-filler
   □ Handles parse-from-resume portals (upload first, wait 3s, scan remaining)
   □ Manages multi-page navigation (Next/Continue detection + re-scan)
   □ Calls submit-handler and confirmation detection
   □ Returns ApplicationRecord to worker

□ content/field-detector.ts:
   □ Scan DOM for all interactive form elements
   □ Resolve label via: aria-label → htmlFor → placeholder → name → surrounding text → parent heading
   □ Classify type: text/email/tel/number/textarea/select/radio/checkbox/file/date/richtext/custom-dropdown/unknown
   □ Return DetectedField[] sorted visually (top-to-bottom, left-to-right)

□ content/field-mapper.ts:
   □ Two-stage: deterministic lookup table (PRD §11 table) → regex qa_bank match → LLM fallback
   □ Never call LLM for fields that have a deterministic match
   □ Flag low-confidence LLM responses as needs_review

□ content/field-filler.ts:
   □ Type-appropriate DOM interaction for every field class
   □ Full synthetic event chain: focus → set value → input → change → keyup → blur
   □ Character-by-character typing for text > 100 chars (8–25ms/char)
   □ Scroll into view before fill
   □ Random delay 200–600ms between fields

□ content/resume-uploader.ts:
   □ Scenario A: native input[type=file] via DataTransfer
   □ Scenario B: React/Angular controlled via nativeInputValueSetter override
   □ Scenario C: drag-and-drop zone simulation
   □ Scenario D: async pre-submit upload with waitForCondition (30s timeout)
   □ Pre-upload checks: file type accept, size limit parsing
   □ Fallback chain: A → B → C → D → fail

□ content/dropdown-handler.ts:
   □ Native select: value match → closest text match → dispatch change
   □ Custom dropdowns (react-select, Select2): click → type → filter → click option

□ content/dynamic-watcher.ts:
   □ MutationObserver on form container (childList + subtree + attributeFilter)
   □ After each fill: wait 800ms, collect new fields, add to queue
   □ Deduplicate by selector; cap at 60 fields/page

□ content/submit-handler.ts:
   □ Detect Next/Continue vs Submit buttons by priority order (PRD §18)
   □ Click with proper event chain
   □ Detect confirmation via URL patterns + page text (10s polling)
   □ Post-submit validation error detection + one auto-fix retry

□ content/captcha-detector.ts:
   □ Pre-fill: detect reCAPTCHA iframe, hCaptcha widget → enter AWAITING_USER
   □ Post-submit: same detection within 10s of submit
```

### 5.3 Implementation Order Within Phase 2
1. `field-detector.ts` + `field-filler.ts` (text/email/textarea first)
2. `field-mapper.ts` (deterministic table)
3. `dropdown-handler.ts` (native select)
4. `resume-uploader.ts` (Scenario A first, then B/C/D)
5. `dynamic-watcher.ts`
6. `submit-handler.ts`
7. `captcha-detector.ts`
8. `form-agent.ts` (wires everything together)

---

## 6 · Phase 3 — ATS Detection & Strategies

### 6.1 Goals
- Identify the ATS from URL + DOM signals before filling begins
- Load strategy-specific overrides while reusing generic filling logic
- Support 9 known ATSs + generic fallback

### 6.2 Tasks

```
□ ats/detector.ts:
   □ URL pattern matching for: greenhouse, lever, workday, taleo, zoho, darwinbox, keka, freshteam, successfactors
   □ DOM signal fallback: meta tags, script src patterns, data attributes
   □ Return strategy key + confidence score

□ ats/strategies/generic.ts — default hooks:
   □ beforeFill(): noop
   □ detectFields(): uses field-detector.ts defaults
   □ afterFieldFill(field): noop
   □ detectSubmitButton(): uses submit-handler.ts defaults
   □ detectConfirmation(): uses submit-handler.ts defaults

□ Create ATS-specific strategies (override only what differs):
   □ greenhouse.ts — mostly generic, very consistent
   □ lever.ts — override: React synthetic events for all inputs
   □ workday.ts — override: iFrame handling, slower load waits, multi-step detection
   □ taleo.ts — override: iFrame handling, older DOM selectors
   □ zoho.ts — override: consistent field naming boosts mapping accuracy
   □ darwinbox.ts — override: custom dropdown handling, React SPA navigation
   □ generic.ts — fallback when no pattern matches
```

### 6.3 Notes
- Keka, Freshteam, and SAP SuccessFactors can map to `generic.ts` in early builds if time-constrained.
- SAP SuccessFactors should immediately return `ATS_UNSUPPORTED` in P1 (PRD §21).

---

## 7 · Phase 4 — Popup UI

### 7.1 Goals
- Provide the only user-facing surface of the extension
- Reflect live session state with zero direct API calls
- Support all 6 views: AUTH, READY, RUNNING, PAUSED, AWAITING_USER, SUMMARY

### 7.2 Tasks

```
□ popup/index.html — static shell with 360×500px fixed viewport
□ popup/popup.css — scoped styles matching WisOwl dark theme (PRD colors)
□ popup/popup.ts:
   □ On open: read SessionState + ApplicationRecord[] from storage
   □ Subscribe to SESSION_UPDATE messages from worker for live updates
   □ Render view based on status enum
   □ AUTH view: "Connect to WisOwl" button → opens app.wisowl.com
   □ READY view: job count, match breakdown, Start button
   □ RUNNING view: progress bar, current job, live log (last 5 entries), Pause/Stop
   □ PAUSED view: progress so far, Resume/Stop
   □ AWAITING_USER view: explanation, "I've resolved it — Continue" button
   □ SUMMARY view: applied/failed/review counts, collapsible per-job log
   □ Live log format: [✓] Company — Title / [✗] / [⚠] / [→]
```

### 7.3 Design Notes
- No framework. Use vanilla DOM manipulation + CSS transitions.
- All interactivity is message-based: popup sends commands (START, PAUSE, RESUME, STOP, CONTINUE) to worker; worker broadcasts state updates.

---

## 8 · Phase 5 — Integration, Reliability & Polish

### 8.1 Goals
- Wire all modules together into a single cohesive flow
- Harden against real-world edge cases
- Ensure MV3 restart resilience is bulletproof
- Implement anti-detection behaviors fully

### 8.2 Tasks

```
□ Integration testing:
   □ Auth handoff: simulate message from app.wisowl.com → verify token storage
   □ End-to-end: start session → open tab → inject → fill → submit → log result → close tab
   □ Multi-page form simulation on a local HTML fixture

□ Error handling audit (PRD §21):
   □ Every error code has a defined action and job status
   □ Required-field validation: never submit with empty required fields
   □ Worker restart: verify resume from storage, close orphaned tabs

□ Anti-detection behaviors (PRD §19):
   □ Random delays between fields (200–600ms)
   □ Character-by-character typing for long text
   □ Focus/blur event chain on every field
   □ Visual order filling (top-to-bottom)
   □ Scroll into view before interaction
   □ Skip hidden fields

□ State machine hardening (PRD §20):
   □ Every transition is coded and guarded
   □ Invalid transitions are rejected and logged

□ CAPTCHA timeout handling:
   □ 5-minute timeout awaiting user → abandon job, mark failed, continue session
```

---

## 9 · Phase 6 — Testing & QA

### 9.1 Goals
- Validate against real ATS forms
- Catch regressions in field detection / filling
- Measure success rate on a sample job queue

### 9.2 Testing Strategy

```
□ Unit tests (Vitest):
   □ lib/utils.ts — normalize, fuzzyMatch, randomDelay
   □ lib/wait.ts — waitForElement with mock DOM
   □ ats/detector.ts — URL pattern matching
   □ field-mapper.ts — deterministic mapping table
   □ storage.ts — mock chrome.storage.local

□ Integration tests (local HTML fixtures):
   □ Standard HTML form (all input types)
   □ React-controlled form (simulated with React CDN)
   □ Multi-page form (local navigation)
   □ Custom dropdown (simulated react-select markup)
   □ Parse-from-resume portal (upload triggers autofill simulation)

□ Manual ATS testing (live sites, non-submission):
   □ Greenhouse: 3–5 forms
   □ Lever: 3–5 forms
   □ Workday: 2 forms (no submit, just fill verification)
   □ Zoho Recruit: 3–5 forms
   □ Darwinbox: 2 forms
   □ Generic/custom career pages: 5 forms

□ End-to-end session test:
   □ Run full session with 5 real jobs
   □ Verify all result codes are posted to backend
   □ Verify popup live log accuracy
```

### 9.3 Success Criteria (P1)
- **Field detection rate:** ≥ 90% of visible fields detected
- **Field fill rate (deterministic):** ≥ 95% of mapped fields filled correctly
- **Resume upload success:** ≥ 80% across all scenarios
- **Form submission confirmation:** ≥ 70% confirmed, ≤ 25% needs_review, ≤ 5% failed
- **Session completion:** Worker survives 25-job session without unhandled errors

---

## 10 · Phase 7 — Packaging & Distribution

### 10.1 Tasks

```
□ Build script: npm run build → production bundle in dist/
□ Verify manifest.json is valid MV3
□ Generate icons: 16×16, 48×48, 128×128 (WisOwl brand)
□ Create Chrome Web Store listing assets:
   □ Screenshots (popup views)
   □ Description (≤ 1000 chars)
   □ Privacy policy (required for <all_urls> permission)
□ Zip dist/ for upload
□ Prepare developer mode install instructions (for beta testers)
□ Document known limitations (P2 features) in release notes
```

---

## 11 · Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backend endpoints not ready on time | Medium | **Critical** | Parallel track: mock server with fixture data for extension development |
| Chrome Web Store review rejection | Medium | High | Submit early; include detailed privacy policy; justify `<all_urls>` permission |
| Workday/Taleo iFrame complexity | High | Medium | Document as P2; fallback to `needs_review` |
| React/Angular synthetic event bypass breaks | Medium | High | Maintain fallback chain; test on latest framework versions |
| Bot detection on major ATSs | Medium | High | Anti-detection rules (§19); if blocked, pivot to `needs_review` |
| MV3 service worker restarts mid-fill | Medium | High | Extensive restart-resilience testing; always store state |
| Resume PDF fetch blocked by CSP | Low | Medium | Background worker fetches (bypasses page CSP) |

---

## 12 · Open Questions to Resolve Before Coding Starts

The PRD lists 7 open questions (§25). The following must be answered to unblock implementation:

1. **Tab visibility:** Background (`active: false`) or foreground? → *Recommend background with foreground fallback on detection failure.*
2. **Daily cap:** 20? 25? → *Recommend 25 with backend-enforced ceiling.*
3. **Pre-generated answer review:** User preview vs fully automated? → *Recommend fully automated for P1 friction; add review toggle in P2.*
4. **Extension ID:** Obtain from Chrome Web Store developer dashboard before web app integration.
5. **Distribution:** Chrome Web Store vs developer mode beta? → *Recommend developer mode for internal beta, CWS for public.*
6. **CAPTCHA timeout:** 5 minutes? → *Recommend 5 min with visible countdown in popup.*
7. **Pre-generation timing:** Nightly vs on-demand? → *Recommend nightly batch for backend load; extension expects cached data.*

---

## 13 · File Tree (Target State)

```
wisowl-autoapply/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── BUILD_PLAN.md
├── background/
│   └── worker.ts
├── content/
│   ├── form-agent.ts
│   ├── field-detector.ts
│   ├── field-mapper.ts
│   ├── field-filler.ts
│   ├── resume-uploader.ts
│   ├── dropdown-handler.ts
│   ├── dynamic-watcher.ts
│   ├── submit-handler.ts
│   └── captcha-detector.ts
├── ats/
│   ├── detector.ts
│   └── strategies/
│       ├── generic.ts
│       ├── greenhouse.ts
│       ├── lever.ts
│       ├── workday.ts
│       ├── zoho.ts
│       ├── darwinbox.ts
│       └── taleo.ts
├── popup/
│   ├── index.html
│   ├── popup.ts
│   └── popup.css
├── api/
│   └── wisowl.ts
├── lib/
│   ├── storage.ts
│   ├── messages.ts
│   ├── wait.ts
│   └── utils.ts
├── types/
│   └── index.ts
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 14 · Daily Standup Checklist (Suggested)

Each day of build, verify:
- [ ] `chrome.storage.local` is the only persistent state store
- [ ] No API keys or JWTs are logged to console
- [ ] Every `sendMessage` call uses typed wrappers
- [ ] All delays are randomized within PRD ranges
- [ ] Hidden fields are skipped
- [ ] Required fields are never left blank on submit

---

*Plan version: 1.0 · Generated from PRD v2.0*
