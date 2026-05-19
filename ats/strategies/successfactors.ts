import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// SAP SuccessFactors Strategy — Enterprise multi-step wizard
// Common on: *.successfactors.com, SAP career portals
// ═══════════════════════════════════════════════════════════════

export const successFactorsStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'successfactors',
  name: 'SAP SuccessFactors',

  beforeFill() {
    // SuccessFactors uses heavy JS frameworks — wait longer
    return new Promise((resolve) => setTimeout(resolve, 2000));
  },

  detectFields(doc) {
    // SAP uses data-sf-* attributes and specific aria patterns
    const sfFields = doc.querySelectorAll('[data-sf-field], [data-automation-id*="field"]');
    if (sfFields.length > 0) {
      // Custom SAP field detection
    }
    return [];
  },

  detectSubmitButton(doc) {
    const selectors = [
      'button[data-sf-action="submit"]',
      'button[title="Submit"]',
      'button[aria-label*="Submit"]',
      'button[data-automation-id="submitButton"]',
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
      'button[data-sf-action="next"]',
      'button[title="Next"]',
      'button[aria-label*="Next"]',
      'button[data-automation-id="nextButton"]',
    ];
    for (const selector of selectors) {
      const btn = doc.querySelector(selector) as HTMLElement | null;
      if (btn) return btn;
    }
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },

  detectConfirmation(doc, url) {
    const bodyText = doc.body?.innerText || '';
    return (
      /application.*submitted|thank.*you|successfully.*applied/i.test(bodyText) ||
      /application.*received|confirmation|we.*review.*application/i.test(bodyText)
    );
  },
};
