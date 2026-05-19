import { waitForCondition, delay } from '../lib/wait.js';
import { randomDelay } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// ═══════════════════════════════════════════════════════════════
// Submit Handler — Submit button detection + confirmation capture
// PRD Reference: Section 18 (Submit & Confirmation Detection)
// ═══════════════════════════════════════════════════════════════

const SUBMIT_PATTERNS = [
  /^submit/i,
  /^apply/i,
  /send application/i,
  /complete application/i,
  /finish/i,
  /confirm/i,
];

const NEXT_PATTERNS = [
  /^next/i,
  /continue/i,
  /save & continue/i,
  /proceed/i,
  /save and continue/i,
];

const SUCCESS_URL_PATTERNS = [
  /thank.?you/i,
  /success/i,
  /confirmation/i,
  /application.submitted/i,
  /applied/i,
];

const SUCCESS_TEXT_PATTERNS = [
  /application.*received/i,
  /thank you for applying/i,
  /successfully submitted/i,
  /we.ll be in touch/i,
  /application complete/i,
  /आपका आवेदन/i,
];

interface SubmitResult {
  success: boolean;
  confirmation: string | null;
  reason?: string;
  detail?: string;
}

export const submitHandler = {
  detectSubmitButton(doc: Document): HTMLElement | null {
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
        if (SUBMIT_PATTERNS.some((p) => p.test(text))) {
          return el;
        }
      }
    }

    return null;
  },

  detectNextButton(doc: Document): HTMLElement | null {
    const selectors = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      'a[href]',
    ];

    for (const selector of selectors) {
      const elements = doc.querySelectorAll<HTMLElement>(selector);
      for (const el of Array.from(elements)) {
        const text = (el.textContent || el.getAttribute('value') || '').trim();
        if (NEXT_PATTERNS.some((p) => p.test(text))) {
          return el;
        }
      }
    }

    return null;
  },

  async submit(doc: Document, url: string): Promise<SubmitResult> {
    const submitBtn = this.detectSubmitButton(doc);
    if (!submitBtn) {
      logger.warn('SubmitHandler', 'No submit button found');
      return { success: false, reason: 'NO_SUBMIT_BUTTON', confirmation: null };
    }

    submitBtn.scrollIntoView({ block: 'center' });
    await randomDelay(300, 700);
    submitBtn.click();
    logger.info('SubmitHandler', 'Submit button clicked');

    // Wait for confirmation
    const confirmed = await waitForCondition(
      () => this.detectConfirmation(doc, url),
      { timeout: 10000, interval: 500 }
    );

    if (confirmed) {
      const confirmationText = this.extractConfirmationText(doc, url);
      logger.info('SubmitHandler', 'Confirmation detected', { text: confirmationText.slice(0, 100) });
      return { success: true, confirmation: confirmationText };
    }

    // Check for validation errors
    const hasValidationErrors = this.detectValidationErrors(doc);
    if (hasValidationErrors) {
      logger.warn('SubmitHandler', 'Validation errors detected, attempting retry');
      await delay(1000);
      const retryConfirmed = await this.attemptRetrySubmit(doc, url);
      if (retryConfirmed) {
        return { success: true, confirmation: this.extractConfirmationText(doc, url) };
      }
      return { success: false, reason: 'VALIDATION_ERROR', confirmation: null };
    }

    return {
      success: false,
      reason: 'SUBMIT_UNCONFIRMED',
      confirmation: doc.body.innerText.slice(0, 500),
    };
  },

  detectConfirmation(doc: Document, url: string): boolean {
    if (SUCCESS_URL_PATTERNS.some((p) => p.test(url))) return true;
    const bodyText = doc.body?.innerText || '';
    return SUCCESS_TEXT_PATTERNS.some((p) => p.test(bodyText));
  },

  extractConfirmationText(doc: Document, url: string): string {
    if (SUCCESS_URL_PATTERNS.some((p) => p.test(url))) return url;
    const bodyText = doc.body?.innerText || '';
    for (const pattern of SUCCESS_TEXT_PATTERNS) {
      const match = bodyText.match(pattern);
      if (match) return match[0];
    }
    return bodyText.slice(0, 200);
  },

  detectValidationErrors(doc: Document): boolean {
    const errorSelectors = [
      '[class*="error"]',
      '[class*="invalid"]',
      '[aria-invalid="true"]',
      '[class*="validation"]',
      '[class*="required"]',
    ];
    for (const selector of errorSelectors) {
      const el = doc.querySelector(selector);
      if (el) return true;
    }
    return false;
  },

  async attemptRetrySubmit(doc: Document, url: string): Promise<boolean> {
    const submitBtn = this.detectSubmitButton(doc);
    if (!submitBtn) return false;
    submitBtn.click();
    return waitForCondition(() => this.detectConfirmation(doc, url), {
      timeout: 8000,
      interval: 500,
    });
  },
};
