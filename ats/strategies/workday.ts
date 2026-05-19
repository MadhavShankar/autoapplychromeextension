import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Workday Strategy — iFrame embedded, multi-step, slow loads
// ═══════════════════════════════════════════════════════════════

export const workdayStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'workday',
  name: 'Workday',

  beforeFill() {
    // Workday pages load slowly — wait for main content
    // form-agent.ts already waits for DOM ready + extra delay
  },

  detectFields(doc) {
    // Workday uses data-automation-id attributes
    const fields = doc.querySelectorAll('[data-automation-id]');
    if (fields.length > 0) {
      // Could build custom detection here using data-automation-id patterns
    }
    return [];
  },

  detectNextButton(doc) {
    // Workday uses specific button data attributes
    const btn = doc.querySelector(
      'button[data-automation-id="nextButton"], button[title="Next"], button[aria-label*="Next"]'
    ) as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },

  detectSubmitButton(doc) {
    const btn = doc.querySelector(
      'button[data-automation-id="submitButton"], button[title="Submit"]'
    ) as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },
};
