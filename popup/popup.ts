import { storage } from '../lib/storage.js';
import { sendToWorker, listenForPopupMessages } from '../lib/messages.js';
import { logger } from '../lib/logger.js';
import type {
  SessionState,
  ApplicationRecord,
  SessionUpdatePayload,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Popup UI — Production State-Driven View Renderer
// PRD Reference: Section 23 (Popup UI)
// ═══════════════════════════════════════════════════════════════

type ViewName = 'auth' | 'ready' | 'running' | 'paused' | 'awaiting' | 'summary';

const views: Record<ViewName, HTMLElement> = {
  auth: document.getElementById('view-auth')!,
  ready: document.getElementById('view-ready')!,
  running: document.getElementById('view-running')!,
  paused: document.getElementById('view-paused')!,
  awaiting: document.getElementById('view-awaiting')!,
  summary: document.getElementById('view-summary')!,
};

// ── Init ──

async function init(): Promise<void> {
  bindButtonHandlers();

  listenForPopupMessages((msg) => {
    if (msg.type === 'SESSION_UPDATE') {
      render((msg as SessionUpdatePayload).state, (msg as SessionUpdatePayload).records);
    }
  });

  const state = await storage.getSessionState();
  const records = (await storage.getApplicationRecords()) ?? [];
  render(state, records);
}

function bindButtonHandlers(): void {
  document.getElementById('btn-connect')?.addEventListener('click', handleConnect);
  document.getElementById('btn-start')?.addEventListener('click', handleStart);
  document.getElementById('btn-pause')?.addEventListener('click', handlePause);
  document.getElementById('btn-resume')?.addEventListener('click', handleResume);
  document.getElementById('btn-stop')?.addEventListener('click', handleStop);
  document.getElementById('btn-stop-paused')?.addEventListener('click', handleStop);
  document.getElementById('btn-continue')?.addEventListener('click', handleContinue);
  document.getElementById('btn-new-session')?.addEventListener('click', handleNewSession);
}

// ── Render ──

function render(state: SessionState | null, records: ApplicationRecord[]): void {
  const status = state?.status ?? 'idle';
  const hasToken = !!state?.session_id || status !== 'idle';

  let view: ViewName = 'auth';
  if (status === 'running') view = 'running';
  else if (status === 'paused') view = 'paused';
  else if (status === 'awaiting_user') view = 'awaiting';
  else if (status === 'completed') view = 'summary';
  else if (status === 'error') view = 'auth';
  else if (hasToken) view = 'ready';

  switchView(view);

  switch (view) {
    case 'ready':
      populateReady(state, records);
      break;
    case 'running':
      populateRunning(state!, records);
      break;
    case 'paused':
      populatePaused(state!, records);
      break;
    case 'awaiting':
      populateAwaiting(state!);
      break;
    case 'summary':
      populateSummary(state!, records);
      break;
  }
}

function switchView(active: ViewName): void {
  (Object.keys(views) as ViewName[]).forEach((key) => {
    views[key].classList.toggle('hidden', key !== active);
  });
}

// ── View populators ──

function populateReady(state: SessionState | null, _records: ApplicationRecord[]): void {
  const total = state?.total_jobs ?? 0;
  document.getElementById('ready-total')!.textContent = String(total);
  document.getElementById('ready-high')!.textContent = '—';
  document.getElementById('ready-medium')!.textContent = '—';
}

function populateRunning(state: SessionState, records: ApplicationRecord[]): void {
  document.getElementById('run-current')!.textContent = String(Math.min(state.current_index + 1, state.total_jobs));
  document.getElementById('run-total')!.textContent = String(state.total_jobs);
  const pct = state.total_jobs > 0 ? ((state.current_index / state.total_jobs) * 100).toFixed(1) : '0';
  document.getElementById('run-progress')!.style.width = `${pct}%`;

  const currentRecord = records[records.length - 1];
  const jobText = currentRecord
    ? `${currentRecord.job_id} · ${currentRecord.status}`
    : state.active_tab_id
    ? 'Loading page…'
    : 'Initializing…';
  document.getElementById('run-job')!.textContent = jobText;

  const logEl = document.getElementById('run-log')!;
  logEl.innerHTML = records
    .slice(-5)
    .map((r) => {
      const statusClass =
        r.status === 'applied'
          ? 'applied'
          : r.status === 'failed'
          ? 'failed'
          : r.status === 'needs_review'
          ? 'review'
          : 'running';
      const icon =
        r.status === 'applied'
          ? '✓'
          : r.status === 'failed'
          ? '✗'
          : r.status === 'needs_review'
          ? '⚠'
          : '→';
      return `<div class="log-entry"><span class="log-status ${statusClass}">${icon}</span> ${escapeHtml(r.job_id)}</div>`;
    })
    .join('');
}

function populatePaused(state: SessionState, _records: ApplicationRecord[]): void {
  document.getElementById('pause-applied')!.textContent = String(state.applied_count);
  document.getElementById('pause-failed')!.textContent = String(state.failed_count);
  document.getElementById('pause-review')!.textContent = String(state.review_count);
}

function populateAwaiting(state: SessionState): void {
  const reasonEl = document.getElementById('await-reason')!;
  reasonEl.textContent =
    state.awaiting_reason === 'CAPTCHA'
      ? 'A CAPTCHA was detected on the current page.'
      : state.awaiting_reason === 'USER_CONFIRM'
      ? 'A field needs your confirmation.'
      : 'The current page needs your attention.';
}

function populateSummary(state: SessionState, records: ApplicationRecord[]): void {
  document.getElementById('sum-applied')!.textContent = String(state.applied_count);
  document.getElementById('sum-failed')!.textContent = String(state.failed_count);
  document.getElementById('sum-review')!.textContent = String(state.review_count);

  const logEl = document.getElementById('sum-log')!;
  logEl.innerHTML = records
    .map((r) => {
      const icon = r.status === 'applied' ? '✓' : r.status === 'failed' ? '✗' : '⚠';
      const cls =
        r.status === 'applied'
          ? 'applied'
          : r.status === 'failed'
          ? 'failed'
          : 'review';
      return `<div class="log-entry"><span class="log-status ${cls}">${icon}</span> ${escapeHtml(r.job_id)} — ${r.status}${r.fail_reason ? ` (${r.fail_reason})` : ''}</div>`;
    })
    .join('');
}

// ── Button handlers ──

function handleConnect(): void {
  chrome.tabs.create({ url: 'https://app.wisowl.com' });
}

async function handleStart(): Promise<void> {
  try {
    await sendToWorker({ type: 'START_SESSION' });
  } catch (err) {
    logger.error('Popup', 'Start failed', err);
    alert('Failed to start session. Please check your connection.');
  }
}

async function handlePause(): Promise<void> {
  try {
    await sendToWorker({ type: 'PAUSE_SESSION' });
  } catch (err) {
    logger.error('Popup', 'Pause failed', err);
  }
}

async function handleResume(): Promise<void> {
  try {
    await sendToWorker({ type: 'RESUME_SESSION' });
  } catch (err) {
    logger.error('Popup', 'Resume failed', err);
  }
}

async function handleStop(): Promise<void> {
  try {
    await sendToWorker({ type: 'STOP_SESSION' });
  } catch (err) {
    logger.error('Popup', 'Stop failed', err);
  }
}

async function handleContinue(): Promise<void> {
  try {
    await sendToWorker({ type: 'CONTINUE_AWAITING' });
  } catch (err) {
    logger.error('Popup', 'Continue failed', err);
  }
}

async function handleNewSession(): Promise<void> {
  await storage.removeSessionState();
  render(null, []);
}

// ── Utilities ──

function escapeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', init);
