# WisOwl Auto-Apply · Digital Ocean Worker

## Pre-Generation Service

Runs nightly to generate cover letters and QA banks for matched jobs.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-api03-...
```

3. Run manually:
```bash
npm start
```

4. Deploy to Digital Ocean App Platform as a Worker with cron schedule:
```yaml
# do-app.yaml
name: wisowl-pre-generation
services:
  - name: pre-generation
    source_dir: /
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    jobs:
      - name: nightly-pregen
        kind: PRE_DEPLOY
        run_command: npm start
        # Or use DO Functions for scheduled execution
```

Alternatively, use Digital Ocean Functions with a cron trigger:
```bash
doctl serverless deploy .
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `ANTHROPIC_API_KEY` | Claude API key |
