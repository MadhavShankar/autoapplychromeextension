import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Lever Strategy — React-controlled inputs need synthetic events
// ═══════════════════════════════════════════════════════════════

export const leverStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'lever',
  name: 'Lever',

  beforeFill() {
    // Lever uses React — ensure we dispatch full event chains
    // The generic field-filler already does this via focus/input/change/keyup/blur
  },

  detectFields(doc) {
    // Lever wraps fields in divs with specific classes
    return [];
  },

  afterFieldFill(field) {
    // Some Lever forms validate on blur — already handled by field-filler
  },
};
