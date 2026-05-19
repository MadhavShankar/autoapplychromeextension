// ═══════════════════════════════════════════════════════════════
// Wait utilities — async DOM polling and timed delays
// ═══════════════════════════════════════════════════════════════

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.random() * (max - min) + min;
  return delay(Math.floor(ms));
}

interface WaitOptions {
  timeout?: number;
  interval?: number;
  signal?: AbortSignal;
}

export async function waitForElement(
  selector: string,
  options: WaitOptions = {}
): Promise<Element | null> {
  const { timeout = 10000, interval = 500, signal } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (signal?.aborted) return null;
    const el = document.querySelector(selector);
    if (el) return el;
    await delay(interval);
  }
  return null;
}

export async function waitForCondition(
  condition: () => boolean,
  options: WaitOptions = {}
): Promise<boolean> {
  const { timeout = 10000, interval = 500, signal } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (signal?.aborted) return false;
    if (condition()) return true;
    await delay(interval);
  }
  return false;
}

export async function waitForDomReady(timeout = 5000): Promise<void> {
  if (document.readyState === 'complete') return;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DOM ready timeout')), timeout);
    window.addEventListener('load', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, context?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout${context ? ` (${context})` : ''}: exceeded ${ms}ms`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
