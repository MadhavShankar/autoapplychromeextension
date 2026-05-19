import { storage } from '../lib/storage.js';
import {
  listenForExternalMessages,
  listenForWorkerMessages,
  listenForContentMessages,
  broadcastToPopup,
  sendToContent,
} from '../lib/messages.js';
import { randomDelay, withTimeout } from '../lib/wait.js';
import { generateUUID } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import {
  fetchProfile,
  fetchJobQueue,
  fetchResumeUrl,
  fetchLLMAssist,
  postResult,
  postSessionEnd,
  fetchResumeFile,
  flushPendingResults,
} from '../api/wisowl.js';
import type {
  AuthToken,
  SessionState,
  ApplicationRecord,
  JobQueueItem,
  UserProfile,
  WorkerMessage,
  ContentMessage,
  ErrorCode,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Background Service Worker — Production Session Orchestrator
// PRD Reference: Section 11 (Components), Section 20 (State Machine)
// ═══════════════════════════════════════════════════════════════

const KEEPALIVE_ALARM = 'wisowl_keepalive';
const CONTENT_SCRIPT_FILE = 'content/form-agent.js';

// Tab load listener registry for cleanup
const tabListeners = new Map<number, (tabId: number, info: chrome.tabs.TabChangeInfo) => void>();

// ── State helpers ──

async function getState(): Promise<SessionState> {
  return (
    (await storage.getSessionState()) ?? {
      session_id: '',
      status: 'idle',
      total_jobs: 0,
      current_index: 0,
      applied_count: 0,
      failed_count: 0,
      skipped_count: 0,
      review_count: 0,
      started_at: null,
      active_tab_id: null,
      awaiting_reason: null,
    }
  );
}

async function saveState(state: SessionState): Promise<void> {
  await storage.setSessionState(state);
  await storage.setRunningFlag(state.status === 'running');
  const records = (await storage.getApplicationRecords()) ?? [];
  broadcastToPopup({ type: 'SESSION_UPDATE', state, records });
}

async function addRecord(record: ApplicationRecord): Promise<void> {
  const records = (await storage.getApplicationRecords()) ?? [];
  records.push(record);
  await storage.setApplicationRecords(records);
  const state = await getState();
  broadcastToPopup({ type: 'SESSION_UPDATE', state, records });
}

// ── External auth handoff ──

listenForExternalMessages(async (message, sender, sendResponse) => {
  const origin = sender.origin ?? '';
  if (!origin.startsWith('https://app.wisowl.com')) {
    logger.warn('Auth', 'Rejected external message from untrusted origin', { origin });
    return;
  }

  const payload = message as AuthToken & { type?: string };

  // Handle PING from web app for extension detection
  if (payload.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ready: true });
    return;
  }

  if (payload.token && payload.user_id) {
    await storage.setAuthToken(payload);
    const state = await getState();
    state.status = 'idle';
    state.session_id = '';
    await saveState(state);
    logger.info('Auth', 'Token received and stored');
    sendResponse({ ok: true });
  }
});

// ── Worker message handlers ──

listenForWorkerMessages(async (message) => {
  const msg = message as WorkerMessage;
  logger.info('Worker', 'Command received', { type: msg.type });

  try {
    switch (msg.type) {
      case 'START_SESSION':
        await handleStartSession();
        break;
      case 'PAUSE_SESSION':
        await handlePauseSession();
        break;
      case 'RESUME_SESSION':
        await handleResumeSession();
        break;
      case 'STOP_SESSION':
        await handleStopSession();
        break;
      case 'CONTINUE_AWAITING':
        await handleContinueAwaiting();
        break;
    }
  } catch (err) {
    logger.error('Worker', `Command ${msg.type} failed`, err);
  }
});

// ── Content script message handlers ──

listenForContentMessages(async (message, _sender, sendResponse) => {
  const msg = message as ContentMessage;

  switch (msg.type) {
    case 'LLM_ASSIST_REQUEST': {
      try {
        const res = await fetchLLMAssist({
          job_id: msg.job_id,
          field_label: msg.field_label,
          field_type: msg.field_type,
          options: msg.options,
          context: msg.context,
          resume_snippet: msg.resume_snippet,
        });
        sendResponse({ type: 'LLM_ASSIST_RESPONSE', ...res });
      } catch (err) {
        sendResponse({ type: 'LLM_ASSIST_RESPONSE', answer: '', confidence: 'low' });
      }
      return true;
    }
    case 'GET_RESUME_FILE': {
      try {
        const b64 = await storage.getResumeBase64();
        if (!b64) {
          sendResponse({ error: 'No resume cached' });
          return true;
        }
        const profile = await storage.getProfile();
        const filename = profile?.resume?.filename ?? 'Resume.pdf';
        sendResponse({
          type: 'GET_RESUME_FILE_RESPONSE',
          base64: b64,
          filename,
          mimeType: 'application/pdf',
        });
      } catch {
        sendResponse({ error: 'FILE_FETCH_FAIL' });
      }
      return true;
    }
    case 'JOB_RESULT': {
      try {
        await handleJobResult(msg.record);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: String(err) });
      }
      return true;
    }
  }
});

// ── Session handlers ──

async function handleStartSession(): Promise<void> {
  const state = await getState();
  if (state.status === 'running') {
    logger.warn('Session', 'Start requested but already running');
    return;
  }

  try {
    // Flush any pending results from previous sessions
    await flushPendingResults();

    const [profile, queue, resumeUrl] = await Promise.all([
      fetchProfile(),
      fetchJobQueue(),
      fetchResumeUrl(),
    ]);

    // Cache resume file as base64 for content scripts
    try {
      const { buffer } = await fetchResumeFile(resumeUrl.signed_url);
      const { arrayBufferToBase64 } = await import('../lib/utils.js');
      await storage.setResumeBase64(arrayBufferToBase64(buffer));
    } catch (err) {
      logger.error('Session', 'Failed to prefetch resume', err);
      // Continue without resume — individual jobs will fail upload but session continues
    }

    await storage.setProfile(profile);
    await storage.setJobQueue(queue);
    await storage.setResumeUrl(resumeUrl);
    await storage.setApplicationRecords([]);

    const eligibleJobs = queue.jobs
      .filter((j) => !j.already_applied)
      .slice(0, queue.daily_cap ?? config.dailyCap);

    state.session_id = generateUUID();
    state.status = 'running';
    state.total_jobs = eligibleJobs.length;
    state.current_index = 0;
    state.applied_count = 0;
    state.failed_count = 0;
    state.skipped_count = 0;
    state.review_count = 0;
    state.started_at = new Date().toISOString();
    state.active_tab_id = null;
    state.awaiting_reason = null;

    await saveState(state);
    startKeepalive();

    await processNextJob(eligibleJobs);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'API_FAIL';
    if (code === 'AUTH_EXPIRED') {
      state.status = 'error';
      await saveState(state);
    }
    logger.error('Session', 'Start failed', err);
  }
}

async function handlePauseSession(): Promise<void> {
  const state = await getState();
  if (state.status !== 'running') return;
  logger.info('Session', 'Pausing after current job');
  state.status = 'paused';
  await saveState(state);
}

async function handleResumeSession(): Promise<void> {
  const state = await getState();
  if (state.status !== 'paused') return;
  logger.info('Session', 'Resuming');
  state.status = 'running';
  await saveState(state);
  startKeepalive();

  const queue = await storage.getJobQueue();
  if (!queue) return;
  const eligibleJobs = queue.jobs
    .filter((j) => !j.already_applied)
    .slice(0, queue.daily_cap ?? config.dailyCap);
  await processNextJob(eligibleJobs);
}

async function handleStopSession(): Promise<void> {
  const state = await getState();
  logger.info('Session', 'Stopping');
  await storage.setRunningFlag(false);
  state.status = 'idle';
  await closeActiveTab(state);
  state.active_tab_id = null;
  await saveState(state);
  stopKeepalive();
}

async function handleContinueAwaiting(): Promise<void> {
  const state = await getState();
  if (state.status !== 'awaiting_user') return;
  logger.info('Session', 'Continuing from awaiting_user');
  state.status = 'running';
  state.awaiting_reason = null;
  await saveState(state);
  startKeepalive();

  const queue = await storage.getJobQueue();
  if (!queue) return;
  const eligibleJobs = queue.jobs
    .filter((j) => !j.already_applied)
    .slice(0, queue.daily_cap ?? config.dailyCap);
  await processNextJob(eligibleJobs);
}

async function handleJobResult(record: ApplicationRecord): Promise<void> {
  const state = await getState();

  // Update counters
  switch (record.status) {
    case 'applied':
      state.applied_count++;
      break;
    case 'failed':
      state.failed_count++;
      break;
    case 'skipped':
      state.skipped_count++;
      break;
    case 'needs_review':
      state.review_count++;
      break;
  }

  await addRecord(record);

  // Post result to backend with retry
  try {
    await postResult(record);
  } catch {
    logger.warn('Session', 'Result post failed, queuing for retry', { job_id: record.job_id });
    const pending = (await storage.getPendingResults()) ?? [];
    pending.push(record);
    await storage.setPendingResults(pending);
  }

  // Close tab
  await closeActiveTab(state);
  state.active_tab_id = null;

  // Advance index
  state.current_index++;

  if (state.current_index >= state.total_jobs) {
    logger.info('Session', 'All jobs processed');
    state.status = 'completed';
    await saveState(state);
    stopKeepalive();
    try {
      await postSessionEnd({ session_id: state.session_id, summary: state });
    } catch {
      // best effort
    }
    return;
  }

  if (state.status === 'running') {
    await saveState(state);
    const queue = await storage.getJobQueue();
    if (!queue) return;
    const eligibleJobs = queue.jobs
      .filter((j) => !j.already_applied)
      .slice(0, queue.daily_cap ?? config.dailyCap);
    await processNextJob(eligibleJobs);
  } else {
    await saveState(state);
  }
}

// ── Job processing ──

async function processNextJob(eligibleJobs: JobQueueItem[]): Promise<void> {
  const state = await getState();
  if (state.status !== 'running' || state.current_index >= eligibleJobs.length) {
    return;
  }

  const job = eligibleJobs[state.current_index];
  const profile = await storage.getProfile();
  if (!profile) {
    logger.error('Job', 'No profile found in storage');
    await failJob(job, 'API_FAIL', 'Profile missing from storage');
    return;
  }

  logger.info('Job', `Processing ${job.company} — ${job.title}`, { job_id: job.job_id });

  // Random inter-job delay
  await randomDelay(config.interJobDelayMin, config.interJobDelayMax);

  const stateCheck = await getState();
  if (stateCheck.status !== 'running') return;

  // Open tab
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.create({ url: job.apply_url, active: false });
  } catch (err) {
    logger.error('Job', 'Failed to create tab', err);
    await failJob(job, 'TIMEOUT_PAGE', 'Tab creation failed');
    return;
  }

  state.active_tab_id = tab.id ?? null;
  await saveState(state);

  if (!tab.id) {
    await failJob(job, 'TIMEOUT_PAGE', 'Tab created without ID');
    return;
  }

  // Wait for tab load
  const loaded = await waitForTabLoad(tab.id, config.tabLoadTimeoutMs);
  if (!loaded) {
    logger.warn('Job', 'Page load timeout', { url: job.apply_url });
    await failJob(job, 'TIMEOUT_PAGE', 'Page did not load within 30s');
    return;
  }

  const stateAfterLoad = await getState();
  if (stateAfterLoad.status !== 'running') return;

  // Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: [CONTENT_SCRIPT_FILE],
    });
    logger.debug('Job', 'Content script injected', { tabId: tab.id });
  } catch (err) {
    logger.error('Job', 'Script injection failed', err);
    await failJob(job, 'IFRAME_BLOCKED', 'Script injection failed');
    return;
  }

  // Send job data to content script with timeout
  try {
    await withTimeout(
      sendToContent(tab.id, {
        type: 'INJECT_JOB',
        job,
        profile,
      }),
      5000,
      'content-script-init'
    );
    logger.debug('Job', 'Job data sent to content script', { tabId: tab.id });
  } catch {
    logger.warn('Job', 'Content script did not acknowledge injection');
    await failJob(job, 'NO_FORM', 'Content script did not respond');
  }
}

async function waitForTabLoad(tabId: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);

    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        cleanup();
        resolve(true);
      }
    };

    const removedListener = (removedTabId: number) => {
      if (removedTabId === tabId) {
        cleanup();
        resolve(false);
      }
    };

    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(removedListener);
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
  });
}

async function failJob(job: JobQueueItem, reason: ErrorCode, detail: string): Promise<void> {
  const state = await getState();
  const record: ApplicationRecord = {
    job_id: job.job_id,
    session_id: state.session_id,
    status: 'failed',
    apply_url: job.apply_url,
    ats_detected: null,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: 0,
    fields_total: 0,
    fields_filled: 0,
    fields_skipped: 0,
    fail_reason: reason,
    fail_detail: detail,
    confirmation: null,
    needs_review_reasons: [],
  };
  await handleJobResult(record);
}

// ── Tab cleanup ──

async function closeActiveTab(state: SessionState): Promise<void> {
  if (state.active_tab_id != null) {
    try {
      await chrome.tabs.remove(state.active_tab_id);
      logger.debug('Tab', 'Closed active tab', { tabId: state.active_tab_id });
    } catch {
      // tab may already be closed
    }
  }
}

// ── Keepalive ──

function startKeepalive(): void {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: config.keepaliveIntervalMinutes });
}

function stopKeepalive(): void {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;

  const state = await getState();
  const runningFlag = await storage.getRunningFlag();

  if (state.status === 'running' && !runningFlag) {
    // Worker was restarted mid-session — resume
    logger.info('Worker', 'Restart detected, resuming session');
    await storage.setRunningFlag(true);
    const queue = await storage.getJobQueue();
    if (queue) {
      const eligibleJobs = queue.jobs
        .filter((j) => !j.already_applied)
        .slice(0, queue.daily_cap ?? config.dailyCap);
      await processNextJob(eligibleJobs);
    }
  }
});

// ── Tab close detection ──

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.active_tab_id === tabId && state.status === 'running') {
    logger.warn('Tab', 'User closed active tab during job');
    const queue = await storage.getJobQueue();
    if (!queue) return;
    const eligibleJobs = queue.jobs
      .filter((j) => !j.already_applied)
      .slice(0, queue.daily_cap ?? config.dailyCap);
    const job = eligibleJobs[state.current_index];
    if (job) {
      await failJob(job, 'TAB_CLOSED', 'User closed the active tab');
    }
  }
});

// ── Startup / Install handlers ──

chrome.runtime.onStartup.addListener(async () => {
  logger.info('Worker', 'Browser startup');
  const state = await getState();
  if (state.status === 'running') {
    logger.info('Worker', 'Resuming session after browser startup');
    await storage.setRunningFlag(true);
    startKeepalive();
    const queue = await storage.getJobQueue();
    if (queue) {
      const eligibleJobs = queue.jobs
        .filter((j) => !j.already_applied)
        .slice(0, queue.daily_cap ?? config.dailyCap);
      await processNextJob(eligibleJobs);
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  logger.info('Worker', 'Extension installed/updated');
  await storage.clearAll();
});
