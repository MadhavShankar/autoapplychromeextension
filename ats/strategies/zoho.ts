import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Zoho Recruit Strategy — Consistent field naming, primary ICP
// ═══════════════════════════════════════════════════════════════

export const zohoStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'zoho',
  name: 'Zoho Recruit',

  detectFields(doc) {
    // Zoho uses predictable input IDs and name attributes
    // e.g., input[name="First Name"], input[name="Email"]
    // The generic label resolver should catch these via name attribute fallback
    return [];
  },

  detectSubmitButton(doc) {
    // Zoho often uses a specific submit button class
    const btn = doc.querySelector(
      'input[type="submit"][value="Submit"], button[type="submit"], #submitApplication'
    ) as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },
};
