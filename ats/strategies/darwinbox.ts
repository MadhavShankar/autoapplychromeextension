import type { ATSStrategy } from '../../types/index.js';
import { genericStrategy } from './generic.js';

// ═══════════════════════════════════════════════════════════════
// Darwinbox Strategy — React SPA, custom dropdowns, dynamic sections
// ═══════════════════════════════════════════════════════════════

export const darwinboxStrategy: ATSStrategy = {
  ...genericStrategy,
  key: 'darwinbox',
  name: 'Darwinbox',

  detectFields(doc) {
    // Darwinbox uses custom React components with specific class names
    const inputs = doc.querySelectorAll('.db-input, .db-select, [class*="darwinbox"]');
    if (inputs.length > 0) {
      // Custom detection logic can be added here
    }
    return [];
  },

  afterFieldFill(field) {
    // Darwinbox reveals conditional sections after certain selections
    // dynamic-watcher.ts handles this globally
  },

  detectNextButton(doc) {
    const btn = doc.querySelector(
      'button[class*="next"], button[class*="continue"], [data-testid*="next"]'
    ) as HTMLElement | null;
    if (btn) return btn;
    return genericStrategy.detectNextButton?.(doc) ?? null;
  },
};
