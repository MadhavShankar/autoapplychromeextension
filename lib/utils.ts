import { delay } from './wait.js';

// ═══════════════════════════════════════════════════════════════
// String normalization, fuzzy matching, and anti-detection helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a string for comparison:
 * - lowercase
 * - trim whitespace
 * - collapse multiple spaces
 * - remove punctuation
 */
export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '');
}

/**
 * Simple fuzzy match — returns true if normalized query is a substring
 * of normalized target, or vice versa.
 */
export function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Find the closest string match from an array using Levenshtein distance.
 */
export function findClosest(target: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = levenshtein(normalize(target), normalize(candidates[0]));

  for (let i = 1; i < candidates.length; i++) {
    const score = levenshtein(normalize(target), normalize(candidates[i]));
    if (score < bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }
  return best;
}

/**
 * Levenshtein distance for fuzzy matching.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Random delay within a range — used for anti-detection.
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type text character-by-character into an input.
 * Mimics human typing for anti-detection on long text fields.
 */
export async function typeText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  charDelayMin = 8,
  charDelayMax = 25
): Promise<void> {
  element.focus();
  element.value = '';

  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await randomDelay(charDelayMin, charDelayMax);
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  element.blur();
}

/**
 * Scroll element into center view before interacting.
 */
export function scrollToElement(element: Element): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Check if an element is visible and interactive.
 */
export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Parse file size from label text, e.g. "Max 2MB" → 2097152 bytes.
 * Returns null if no size found.
 */
export function parseFileSizeLimit(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(MB|KB|GB)/i);
  if (!match) return null;
  const size = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  return Math.floor(size * (multipliers[unit] || 1));
}

/**
 * Get all text content from an element and its children, excluding script/style.
 */
export function getVisibleText(element: Element): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  return clone.innerText || '';
}

/**
 * Sanitize a string for safe DOM insertion (basic XSS guard).
 */
export function sanitizeText(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Convert ArrayBuffer to base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a UUID v4. Fallback for environments without crypto.randomUUID.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
