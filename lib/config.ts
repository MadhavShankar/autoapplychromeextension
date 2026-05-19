// ═══════════════════════════════════════════════════════════════
// Runtime Configuration — Environment-aware settings
// ═══════════════════════════════════════════════════════════════

export const config = {
  // API
  apiBaseUrl: 'https://api.wisowl.com/v1',

  // Session
  dailyCap: 25,
  keepaliveIntervalMinutes: 0.4, // 24s — under MV3 30s kill window
  captchaTimeoutMs: 5 * 60 * 1000, // 5 minutes
  tabLoadTimeoutMs: 30_000,
  contentScriptTimeoutMs: 120_000, // 2 minutes max per job
  interJobDelayMin: 2000,
  interJobDelayMax: 5000,

  // Anti-detection
  fieldDelayMin: 200,
  fieldDelayMax: 600,
  typingCharDelayMin: 8,
  typingCharDelayMax: 25,
  typingThreshold: 100, // chars

  // Limits
  maxFieldsPerPage: 60,
  maxPagesPerForm: 10,
  maxDomWaitMs: 5000,

  // Retry
  apiRetries: 3,
  apiRetryDelays: [1000, 2000, 4000],

  // Logging
  logLevel: 'debug' as 'debug' | 'info' | 'warn' | 'error',
  enableVerboseLogging: false,
};

export function isDevelopment(): boolean {
  // In Vite, import.meta.env is available at build time
  // For runtime checks in the extension, we use a compile-time replacement
  return typeof __WISOOWL_DEV__ !== 'undefined' && __WISOOWL_DEV__;
}

declare const __WISOOWL_DEV__: boolean;
