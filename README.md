# WisOwl Auto-Apply · Chrome Extension

> Automatically fills and submits job applications on company career pages.

---

## Overview

WisOwl Auto-Apply is a **Manifest V3 Chrome Extension** that runs on the user's own device to automatically apply to matched jobs. It reads the user's profile and pre-generated answers from the WisOwl backend, navigates to each career page, detects the ATS, fills all form fields, and reports outcomes back to WisOwl.

**Why on-device?**
- Real IP and browser fingerprint = no bot detection or proxy costs
- ~$1.75/user/month vs ~$12.50/user/month for cloud automation

---

## Tech Stack

- **TypeScript** (strict mode)
- **Chrome Extension Manifest V3**
- **Vanilla DOM** — no React/Vue (bundle target < 200KB)
- **Vite** for bundling
- `chrome.storage.local` for all persistent state

---

## Project Structure

```
wisowl-autoapply/
├── manifest.json              # MV3 manifest (copied from public/)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── BUILD_PLAN.md              # Detailed implementation roadmap
├── background/
│   └── worker.ts              # Session orchestrator, API calls, tab lifecycle
├── content/
│   ├── form-agent.ts          # Per-tab entry point
│   ├── field-detector.ts      # DOM scanning for form fields
│   ├── field-mapper.ts        # Profile → field mapping (deterministic → LLM)
│   ├── field-filler.ts        # DOM interactions per field type
│   ├── resume-uploader.ts     # 4 resume upload scenarios
│   ├── dropdown-handler.ts    # Native + custom dropdowns
│   ├── dynamic-watcher.ts     # MutationObserver for conditional fields
│   ├── submit-handler.ts      # Submit + confirmation detection
│   └── captcha-detector.ts    # CAPTCHA presence detection
├── ats/
│   ├── detector.ts            # URL + DOM fingerprinting
│   └── strategies/
│       ├── generic.ts         # Fallback strategy
│       ├── greenhouse.ts
│       ├── lever.ts
│       ├── workday.ts
│       ├── zoho.ts
│       ├── darwinbox.ts
│       └── taleo.ts
├── popup/
│   ├── index.html             # Popup shell
│   ├── popup.ts               # State-driven view renderer
│   └── popup.css              # Scoped dark theme styles
├── api/
│   └── wisowl.ts              # Typed REST API wrappers
├── lib/
│   ├── storage.ts             # chrome.storage.local wrappers
│   ├── messages.ts            # Typed runtime messaging
│   ├── wait.ts                # Async polling helpers
│   └── utils.ts               # String normalization, anti-detection
├── types/
│   └── index.ts               # All shared TypeScript types
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Setup

```bash
npm install
npm run build
```

Load the unpacked extension:
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Development

```bash
npm run dev        # Vite dev mode (watch + HMR for popup)
```

For background worker changes, reload the extension manually in `chrome://extensions`.

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Background Service Worker        │
│  • Session lifecycle                     │
│  • WisOwl API calls (JWT)                │
│  • Tab open / inject / close             │
│  • Keepalive alarm (MV3)                 │
│  • LLM proxy routing                     │
└──────────────┬──────────────────────────┘
               │ chrome.scripting.executeScript
               ▼
┌─────────────────────────────────────────┐
│         Content Script (per tab)         │
│  • ATS detection → strategy selection    │
│  • Field detection → mapping → filling   │
│  • Resume upload (4 scenarios)           │
│  • Dynamic field watching                │
│  • Submit + confirmation                 │
└──────────────┬──────────────────────────┘
               │ chrome.runtime.sendMessage
               ▼
┌─────────────────────────────────────────┐
│              Popup UI (360×500)          │
│  • Auth / Ready / Running / Paused       │
│  • Awaiting User / Summary               │
│  • Live log                              │
└─────────────────────────────────────────┘
```

---

## Supported ATSs (Phase 1)

| ATS | Detection | Notes |
|-----|-----------|-------|
| Greenhouse | `boards.greenhouse.io` | Standard HTML, easiest |
| Lever | `jobs.lever.co` | React inputs |
| Workday | `myworkdayjobs.com` | iFrame, multi-step |
| Taleo | `taleo.net` | iFrame, old DOM |
| Zoho Recruit | `zohorecruit.com` | Consistent naming |
| Darwinbox | `darwinbox.com` | React SPA, custom dropdowns |
| Generic | Fallback | Best-effort fill |

**Phase 2:** Keka, Freshteam, SAP SuccessFactors, LinkedIn Easy Apply, Naukri/Indeed.

---

## Key Behaviors

- **Never submit a form with empty required fields.** If a required field cannot be mapped, the job is logged as `needs_review` and skipped.
- **All state lives in `chrome.storage.local`.** The service worker can restart at any time and resume cleanly.
- **Anti-detection:** randomized delays (200–600ms between fields), character-by-character typing for long text, focus/blur events, visual-order filling.
- **CAPTCHA handling:** Detects reCAPTCHA v2 and hCaptcha → surfaces tab to user → waits for manual solve → resumes.

---

## API Endpoints (WisOwl Backend)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/extension/profile` | User profile |
| GET | `/extension/job-queue?date=` | Daily job list |
| GET | `/extension/resume-url` | Signed PDF URL |
| POST | `/extension/llm-assist` | Claude Haiku proxy |
| POST | `/extension/result` | Per-job outcome |
| POST | `/extension/session-end` | Session summary |

---

## Security

- JWT stored only in `chrome.storage.local` (Chrome encrypts on-device)
- LLM API key never touches the extension
- `externally_connectable` restricted to `https://app.wisowl.com/*`
- Content scripts run in isolated world
- Resume fetched via short-TTL signed URL

---

## Roadmap

See `BUILD_PLAN.md` for the full 7-phase implementation plan.

| Phase | Focus |
|-------|-------|
| 0 | Foundation (types, storage, build) |
| 1 | Background worker (session, API, tabs) |
| 2 | Content scripts (detection, mapping, filling) |
| 3 | ATS strategies |
| 4 | Popup UI |
| 5 | Integration & reliability |
| 6 | Testing & QA |
| 7 | Packaging & distribution |

---

## License

Internal Use Only — WisOwl Technologies Pvt. Ltd.
