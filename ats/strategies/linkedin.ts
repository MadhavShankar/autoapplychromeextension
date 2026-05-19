import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// LinkedIn Easy Apply Strategy — In-page modal (not new tab)
// This is a SPECIAL strategy because LinkedIn Easy Apply opens
// a modal on the job page instead of navigating to a new page.
// The background worker must detect this and inject the content
// script into the CURRENT tab, not open a new one.
// ═══════════════════════════════════════════════════════════════

export const linkedinStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'linkedin',
  name: 'LinkedIn Easy Apply',

  detectFields(doc) {
    // LinkedIn Easy Apply modal uses specific aria and data-test-id attributes
    const modal = doc.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) return [];

    const fields = modal.querySelectorAll(
      'input, textarea, select, [contenteditable="true"]'
    );
    // Return empty to use default detector on modal subset
    return [];
  },

  detectSubmitButton(doc) {
    const modal = doc.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) return null;

    const btn = modal.querySelector(
      'button[aria-label*="Submit application"], button[data-test-modal-close-btn]'
    ) as HTMLElement | null;
    if (btn) return btn;

    // Fallback: any primary button in modal footer
    const footerButtons = modal.querySelectorAll('button');
    for (const el of Array.from(footerButtons)) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('submit application') || text.includes('send')) return el as HTMLElement;
    }
    return null;
  },

  detectNextButton(doc) {
    const modal = doc.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) return null;

    const nextBtn = modal.querySelector(
      'button[aria-label*="Next"]'
    ) as HTMLElement | null;
    if (nextBtn) return nextBtn;

    // LinkedIn uses a footer button bar
    const buttons = modal.querySelectorAll('button');
    for (const el of Array.from(buttons)) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === 'next' || text === 'continue') return el as HTMLElement;
    }
    return null;
  },

  detectConfirmation(doc, url) {
    // LinkedIn shows a confirmation message inside the modal
    const modal = doc.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) {
      // Check for post-submit toast or message
      const bodyText = doc.body?.textContent || '';
      return /application.*sent|successfully.*applied|applied.*successfully/i.test(bodyText);
    }

    const modalText = modal.textContent || '';
    return /application.*sent|successfully.*applied|your.*application.*sent/i.test(modalText);
  },
};
