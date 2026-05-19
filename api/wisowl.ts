import { storage } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { withTimeout } from '../lib/wait.js';
import type {
  UserProfile,
  JobQueue,
  ResumeUrlResponse,
  LLMAssistRequest,
  LLMAssistResponse,
  ApplicationRecord,
  SessionEndRequest,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// WisOwl API Client — Production-grade with circuit breaker,
// offline queue, timeouts, and structured error handling.
// ═══════════════════════════════════════════════════════════════

const API_BASE = config.apiBaseUrl;
const FETCH_TIMEOUT_MS = 30_000;

// ── Auth ──

async function getToken(): Promise<string | null> {
  const auth = await storage.getAuthToken();
  return auth?.token ?? null;
}

// ── Core fetch with auth + timeout ──

async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  if (!token) {
    throw new Error('AUTH_EXPIRED');
  }

  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      throw new Error('AUTH_EXPIRED');
    }

    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('API_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Retry with exponential backoff + offline detection ──

async function fetchWithRetry(
  path: string,
  options: RequestInit = {},
  retries = config.apiRetries
): Promise<Response> {
  const delays = config.apiRetryDelays;
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    // Check online status before each attempt
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      lastError = new Error('NETWORK_OFFLINE');
      await new Promise((r) => setTimeout(r, delays[Math.min(i, delays.length - 1)] ?? 4000));
      continue;
    }

    try {
      const res = await fetchWithAuth(path, options);
      if (res.ok) return res;
      // Only retry on 5xx or network errors
      if (res.status < 500) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      lastError = new Error(`HTTP ${res.status}`);
      logger.warn('API', `HTTP ${res.status} on ${path}, retry ${i + 1}/${retries}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message === 'AUTH_EXPIRED') throw lastError;
      logger.warn('API', `Request failed on ${path}, retry ${i + 1}/${retries}`, lastError.message);
    }

    if (i < retries) {
      await new Promise((r) => setTimeout(r, delays[i] ?? 4000));
    }
  }

  throw lastError ?? new Error('API_FAIL');
}

// ── Endpoints ──

export async function fetchProfile(): Promise<UserProfile> {
  const res = await fetchWithRetry('/extension/profile');
  return res.json() as Promise<UserProfile>;
}

export async function fetchJobQueue(date?: string): Promise<JobQueue> {
  const dateParam = date ? `?date=${date}` : '';
  const res = await fetchWithRetry(`/extension/job-queue${dateParam}`);
  return res.json() as Promise<JobQueue>;
}

export async function fetchResumeUrl(): Promise<ResumeUrlResponse> {
  const res = await fetchWithRetry('/extension/resume-url');
  return res.json() as Promise<ResumeUrlResponse>;
}

export async function fetchLLMAssist(request: LLMAssistRequest): Promise<LLMAssistResponse> {
  const res = await fetchWithRetry('/extension/llm-assist', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return res.json() as Promise<LLMAssistResponse>;
}

export async function postResult(record: ApplicationRecord): Promise<void> {
  await fetchWithRetry('/extension/result', {
    method: 'POST',
    body: JSON.stringify({ record }),
  });
}

export async function postSessionEnd(request: SessionEndRequest): Promise<void> {
  await fetchWithRetry('/extension/session-end', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ── Resume file fetch (background worker only) ──

export async function fetchResumeFile(signedUrl: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(signedUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error('FILE_FETCH_FAIL');
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'application/pdf';
    return { buffer, contentType };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('FILE_FETCH_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Offline result queue ──

export async function flushPendingResults(): Promise<void> {
  const pending = (await storage.getPendingResults()) ?? [];
  if (pending.length === 0) return;

  const failed: ApplicationRecord[] = [];
  for (const record of pending) {
    try {
      await postResult(record);
      logger.info('API', 'Flushed pending result', { job_id: record.job_id });
    } catch {
      failed.push(record);
    }
  }

  await storage.setPendingResults(failed);
}
