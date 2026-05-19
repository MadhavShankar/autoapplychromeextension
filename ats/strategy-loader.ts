import type { ATSKey, ATSStrategy } from '../types/index.js';
import { genericStrategy } from './strategies/generic.js';
import { greenhouseStrategy } from './strategies/greenhouse.js';
import { leverStrategy } from './strategies/lever.js';
import { workdayStrategy } from './strategies/workday.js';
import { zohoStrategy } from './strategies/zoho.js';
import { darwinboxStrategy } from './strategies/darwinbox.js';
import { taleoStrategy } from './strategies/taleo.js';

// ═══════════════════════════════════════════════════════════════
// ATS Strategy Loader — Maps detected ATS to strategy module
// ═══════════════════════════════════════════════════════════════

const STRATEGIES: Record<ATSKey, ATSStrategy> = {
  generic: genericStrategy,
  greenhouse: greenhouseStrategy,
  lever: leverStrategy,
  workday: workdayStrategy,
  zoho: zohoStrategy,
  darwinbox: darwinboxStrategy,
  keka: genericStrategy, // P2
  freshteam: genericStrategy, // P2
  taleo: taleoStrategy,
  successfactors: genericStrategy, // P1: log as needs_review
};

export function getStrategy(key: ATSKey | string): ATSStrategy {
  return STRATEGIES[key as ATSKey] ?? genericStrategy;
}
