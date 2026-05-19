import type {
  AuthToken,
  UserProfile,
  JobQueue,
  SessionState,
  ApplicationRecord,
  ResumeUrlResponse,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Typed chrome.storage.local wrappers with quota guards
// All session state must live here to survive MV3 worker restarts
// ═══════════════════════════════════════════════════════════════

const NS = 'wisowl';

function key(name: string): string {
  return `${NS}:${name}`;
}

async function get<T>(name: string): Promise<T | null> {
  try {
    const result = await chrome.storage.local.get(key(name));
    return (result[key(name)] as T) ?? null;
  } catch (err) {
    console.error('[Storage] get failed:', name, err);
    return null;
  }
}

async function set<T>(name: string, value: T): Promise<void> {
  try {
    await chrome.storage.local.set({ [key(name)]: value });
  } catch (err) {
    console.error('[Storage] set failed:', name, err);
    throw err;
  }
}

async function remove(name: string): Promise<void> {
  try {
    await chrome.storage.local.remove(key(name));
  } catch (err) {
    console.error('[Storage] remove failed:', name, err);
  }
}

async function clear(): Promise<void> {
  try {
    await chrome.storage.local.clear();
  } catch (err) {
    console.error('[Storage] clear failed:', err);
  }
}

// ── Typed accessors ──

export const storage = {
  getAuthToken: () => get<AuthToken>('auth_token'),
  setAuthToken: (token: AuthToken) => set('auth_token', token),
  removeAuthToken: () => remove('auth_token'),

  getProfile: () => get<UserProfile>('profile'),
  setProfile: (profile: UserProfile) => set('profile', profile),
  removeProfile: () => remove('profile'),

  getJobQueue: () => get<JobQueue>('job_queue'),
  setJobQueue: (queue: JobQueue) => set('job_queue', queue),
  removeJobQueue: () => remove('job_queue'),

  getSessionState: () => get<SessionState>('session_state'),
  setSessionState: (state: SessionState) => set('session_state', state),
  removeSessionState: () => remove('session_state'),

  getApplicationRecords: () => get<ApplicationRecord[]>('records'),
  setApplicationRecords: (records: ApplicationRecord[]) => set('records', records),
  removeApplicationRecords: () => remove('records'),

  getResumeUrl: () => get<ResumeUrlResponse>('resume_url'),
  setResumeUrl: (url: ResumeUrlResponse) => set('resume_url', url),
  removeResumeUrl: () => remove('resume_url'),

  getPendingResults: () => get<ApplicationRecord[]>('pending_results'),
  setPendingResults: (records: ApplicationRecord[]) => set('pending_results', records),

  // Raw resume file bytes (stored as base64 to survive structured clone)
  getResumeBase64: () => get<string>('resume_b64'),
  setResumeBase64: (b64: string) => set('resume_b64', b64),
  removeResumeBase64: () => remove('resume_b64'),

  // Running flag — stored so worker can detect restart
  getRunningFlag: () => get<boolean>('is_running'),
  setRunningFlag: (val: boolean) => set('is_running', val),
  removeRunningFlag: () => remove('is_running'),

  clearAll: clear,
};
