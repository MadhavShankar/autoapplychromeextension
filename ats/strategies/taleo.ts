import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Taleo Strategy — iFrame embedded, old DOM, often requires account (P2)
// ═══════════════════════════════════════════════════════════════

export const taleoStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'taleo',
  name: 'Taleo (Oracle)',

  beforeFill() {
    // Taleo forms often load inside iFrames
    // P1: same-origin only; P2: cross-origin workaround TBD
  },

  detectFields(doc) {
    // Taleo uses older HTML with table-based layouts sometimes
    const inputs = doc.querySelectorAll('input[name^="tmfield"], .taleo-field');
    if (inputs.length > 0) {
      // Custom detection for Taleo-specific field names
    }
    return [];
  },

  detectSubmitButton(doc) {
    const btn = doc.querySelector(
      'input[type="submit"][name*="submit"], button[title*="Submit"]'
    ) as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectSubmitButton?.(doc) ?? null;
  },
};
