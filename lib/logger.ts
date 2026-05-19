// ═══════════════════════════════════════════════════════════════
// Structured Logger — Production-safe logging with levels
// ═══════════════════════════════════════════════════════════════

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalLevel: LogLevel = 'info';

try {
  // In development builds, allow verbose logging
  if (typeof __WISOOWL_DEV__ !== 'undefined' && __WISOOWL_DEV__) {
    globalLevel = 'debug';
  }
} catch {
  // __WISOOWL_DEV__ not defined in production
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[globalLevel];
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const logger = {
  setLevel(level: LogLevel): void {
    globalLevel = level;
  },

  debug(component: string, message: string, meta?: unknown): void {
    if (!shouldLog('debug')) return;
    console.debug(`[${timestamp()}] [DBG] [${component}] ${message}`, meta ?? '');
  },

  info(component: string, message: string, meta?: unknown): void {
    if (!shouldLog('info')) return;
    console.info(`[${timestamp()}] [INF] [${component}] ${message}`, meta ?? '');
  },

  warn(component: string, message: string, meta?: unknown): void {
    if (!shouldLog('warn')) return;
    console.warn(`[${timestamp()}] [WRN] [${component}] ${message}`, meta ?? '');
  },

  error(component: string, message: string, error?: unknown): void {
    if (!shouldLog('error')) return;
    if (error instanceof Error) {
      console.error(`[${timestamp()}] [ERR] [${component}] ${message}`, error.message, error.stack);
    } else {
      console.error(`[${timestamp()}] [ERR] [${component}] ${message}`, error ?? '');
    }
  },
};

declare const __WISOOWL_DEV__: boolean;
