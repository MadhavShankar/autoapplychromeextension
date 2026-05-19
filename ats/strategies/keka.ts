import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Keka Strategy — Indian ATS, uses Bootstrap-like form controls
// Common on: keka.com/careers, custom Keka subdomains
// ═══════════════════════════════════════════════════════════════

export const kekaStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'keka',
  name: 'Keka',

  detectFields(doc) {
    // Keka uses form-control, keka-input classes
    const kekaInputs = doc.querySelectorAll('.form-control, .keka-input, [data-keka-field]');
    if (kekaInputs.length > 0) {
      // Custom detection can be added here
    }
    return [];
  },

  detectSubmitButton(doc) {
    const selectors = [
      'button[type="submit"]',
      'button.btn-primary',
      'button[data-testid="submit-application"]',
      'input[type="submit"]',
    ];
    for (const selector of selectors) {
      const btn = doc.querySelector(selector) as HTMLElement | null;
      if (btn) return btn;
    }
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },

  detectNextButton(doc) {
    const selectors = [
      'button.btn-primary',
      'button[type="button"].btn-primary',
    ];
    for (const selector of selectors) {
      try {
        const btn = doc.querySelector(selector) as HTMLElement | null;
        if (btn) {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (text.includes('next') || text.includes('continue') || text.includes('proceed')) {
            return btn;
          }
        }
      } catch {
        // ignore invalid selectors
      }
    }
    // Fallback: scan all buttons
    const allButtons = doc.querySelectorAll('button');
    for (const btn of Array.from(allButtons)) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('next') || text.includes('continue')) return btn as HTMLElement;
    }
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },

  detectConfirmation(doc, url) {
    const bodyText = doc.body?.textContent || '';
    return (
      /application.*submitted|thank.*you|successfully.*applied/i.test(bodyText) ||
      /application.*complete|we.*received.*application/i.test(bodyText)
    );
  },
};
