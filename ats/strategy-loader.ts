import type { ATSKey, ATSStrategy } from '../types/index.js';
import { genericStrategy } from './strategies/generic.js';
import { greenhouseStrategy } from './strategies/greenhouse.js';
import { leverStrategy } from './strategies/lever.js';
import { workdayStrategy } from './strategies/workday.js';
import { zohoStrategy } from './strategies/zoho.js';
import { darwinboxStrategy } from './strategies/darwinbox.js';
import { taleoStrategy } from './strategies/taleo.js';
import { kekaStrategy } from './strategies/keka.js';
import { freshteamStrategy } from './strategies/freshteam.js';
import { successFactorsStrategy } from './strategies/successfactors.js';
import { linkedinStrategy } from './strategies/linkedin.js';
import { naukriIndeedStrategy } from './strategies/naukri-indeed.js';

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
  taleo: taleoStrategy,
  keka: kekaStrategy,
  freshteam: freshteamStrategy,
  successfactors: successFactorsStrategy,
  linkedin: linkedinStrategy,
  naukri_indeed: naukriIndeedStrategy,
};

export function getStrategy(key: ATSKey | string): ATSStrategy {
  return STRATEGIES[key as ATSKey] ?? genericStrategy;
}
