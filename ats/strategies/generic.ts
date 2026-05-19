import type { ATSStrategy } from '../../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Generic ATS Strategy — Default hooks for all field types
// PRD Reference: Section 12 (Strategy Pattern)
// ═══════════════════════════════════════════════════════════════

export const genericStrategy: ATSStrategy = {
  key: 'generic',
  name: 'Generic / Custom',

  beforeFill() {
    // noop
  },

  detectFields(doc) {
    // Use default field-detector.ts logic
    // This hook allows ATS-specific strategies to override selectors
    return [];
  },

  afterFieldFill(field) {
    // noop
  },

  detectSubmitButton(doc) {
    const selectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button',
      '[role="button"]',
      'a[href]',
    ];

    for (const selector of selectors) {
      const elements = doc.querySelectorAll<HTMLElement>(selector);
      for (const el of Array.from(elements)) {
        const text = (el.textContent || el.getAttribute('value') || '').trim();
        if (/^submit|^apply|send application|complete application|finish|confirm/i.test(text)) {
          return el;
        }
      }
    }
    return null;
  },

  detectConfirmation(doc, url) {
    if (/thank.?you|success|confirmation|application.submitted|applied/i.test(url)) return true;
    const bodyText = doc.body?.innerText || '';
    return /application.*received|thank you for applying|successfully submitted|application complete/i.test(bodyText);
  },

  detectNextButton(doc) {
    const selectors = ['button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', 'a[href]'];
    for (const selector of selectors) {
      const elements = doc.querySelectorAll<HTMLElement>(selector);
      for (const el of Array.from(elements)) {
        const text = (el.textContent || el.getAttribute('value') || '').trim();
        if (/^next|continue|save & continue|proceed|save and continue/i.test(text)) {
          return el;
        }
      }
    }
    return null;
  },
};
