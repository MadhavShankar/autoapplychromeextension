import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Naukri / Indeed Strategy — Indian job portals
// Naukri: naukri.com, Indeed: indeed.com / indeed.co.in
// These portals often have custom forms with heavy validation.
// ═══════════════════════════════════════════════════════════════

export const naukriIndeedStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'naukri_indeed',
  name: 'Naukri / Indeed',

  detectFields(doc) {
    // Naukri uses specific wrapper classes
    const naukriFields = doc.querySelectorAll('.naukri-input, .indeed-form-field, [data-testid*="input"]');
    if (naukriFields.length > 0) {
      // Custom detection
    }
    return [];
  },

  detectSubmitButton(doc) {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button.btn-primary',
    ];
    for (const selector of selectors) {
      try {
        const btn = doc.querySelector(selector) as HTMLElement | null;
        if (btn) {
          const text = (btn.textContent || btn.getAttribute('value') || '').trim().toLowerCase();
          if (text.includes('apply') || text.includes('submit') || text.includes('send')) {
            return btn;
          }
        }
      } catch {
        // ignore
      }
    }
    // Fallback: scan all buttons and links
    const allButtons = doc.querySelectorAll('button, a');
    for (const btn of Array.from(allButtons)) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('apply now') || text.includes('apply') || text.includes('submit')) {
        return btn as HTMLElement;
      }
    }
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },

  detectNextButton(doc) {
    const buttons = doc.querySelectorAll('button, input[type="button"], input[type="submit"]');
    for (const el of Array.from(buttons)) {
      const text = (el.textContent || el.getAttribute('value') || '').trim().toLowerCase();
      if (text === 'next' || text === 'continue' || text.includes('save and continue')) {
        return el as HTMLElement;
      }
    }
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },

  detectConfirmation(doc, url) {
    const bodyText = doc.body?.textContent || '';
    return (
      /application.*submitted|successfully.*applied|thank.*you|application.*sent/i.test(bodyText) ||
      /your.*application.*received|we.*review.*application/i.test(bodyText)
    );
  },
};
