import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Greenhouse Strategy — Very consistent standard HTML forms
// ═══════════════════════════════════════════════════════════════

export const greenhouseStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'greenhouse',
  name: 'Greenhouse',

  detectFields(doc) {
    // Greenhouse uses clean, semantic markup — default detector works well
    return [];
  },

  detectSubmitButton(doc) {
    // Greenhouse typically has a clear submit input
    const btn = doc.querySelector('input[type="submit"], button[type="submit"]') as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },
};
