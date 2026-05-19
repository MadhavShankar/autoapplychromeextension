import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Freshteam Strategy — Freshworks ATS
// Common on: *.freshteam.com, freshworks job portals
// ═══════════════════════════════════════════════════════════════

export const freshteamStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'freshteam',
  name: 'Freshteam',

  detectFields(doc) {
    const inputs = doc.querySelectorAll('[data-testid*="field"], .fresh-input, .ft-field');
    if (inputs.length > 0) {
      // Custom Freshteam field detection
    }
    return [];
  },

  detectSubmitButton(doc) {
    const btn = doc.querySelector(
      'button[data-testid="submit-application"], button[type="submit"]'
    ) as HTMLElement | null;
    if (btn) return btn;

    // Freshteam often uses specific class structures
    const freshButtons = doc.querySelectorAll('button.fresh-button, button.btn-primary, button');
    for (const el of Array.from(freshButtons)) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('submit application') || text.includes('submit') || text.includes('apply')) return el as HTMLElement;
    }

    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },

  detectNextButton(doc) {
    const freshButtons = doc.querySelectorAll('button');
    for (const el of Array.from(freshButtons)) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('next') || text.includes('continue') || text.includes('save and continue')) {
        return el as HTMLElement;
      }
    }
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },

  detectConfirmation(doc, url) {
    const bodyText = doc.body?.textContent || '';
    return (
      /application.*submitted|thank.*applying|successfully.*applied/i.test(bodyText) ||
      /we.*received.*application|application.*complete/i.test(bodyText)
    );
  },
};
