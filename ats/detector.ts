import type { ATSKey } from '../../types/index.js';

// ═══════════════════════════════════════════════════════════════
// ATS Detector — Identifies ATS from URL + DOM signals
// PRD Reference: Section 12 (ATS Detection & Strategies)
// ═══════════════════════════════════════════════════════════════

interface ATSSignature {
  key: ATSKey;
  urlPatterns: RegExp[];
  domSignals: string[];
}

const ATS_SIGNATURES: ATSSignature[] = [
  {
    key: 'greenhouse',
    urlPatterns: [/boards\.greenhouse\.io/i],
    domSignals: ['greenhouse', 'gh-form'],
  },
  {
    key: 'lever',
    urlPatterns: [/jobs\.lever\.co/i],
    domSignals: ['lever', 'lever-jobs'],
  },
  {
    key: 'workday',
    urlPatterns: [/myworkdayjobs\.com/i, /wd3\.myworkday/i],
    domSignals: ['workday', 'wd-'],
  },
  {
    key: 'taleo',
    urlPatterns: [/taleo\.net/i],
    domSignals: ['taleo', 'oracle'],
  },
  {
    key: 'zoho',
    urlPatterns: [/zohorecruit\.com/i, /zoho\.com\/recruit/i],
    domSignals: ['zoho', 'zrec'],
  },
  {
    key: 'darwinbox',
    urlPatterns: [/darwinbox\.com/i],
    domSignals: ['darwinbox', 'db-'],
  },
  {
    key: 'keka',
    urlPatterns: [/keka\.com\/careers/i, /kekaats/i],
    domSignals: ['keka', 'keka-ats'],
  },
  {
    key: 'freshteam',
    urlPatterns: [/freshteam\.com/i],
    domSignals: ['freshteam', 'fresh-'],
  },
  {
    key: 'successfactors',
    urlPatterns: [/successfactors\.com/i],
    domSignals: ['successfactors', 'sap'],
  },
];

export function detectATS(url: string, doc: Document): ATSKey {
  for (const signature of ATS_SIGNATURES) {
    // URL match
    if (signature.urlPatterns.some((p) => p.test(url))) {
      return signature.key;
    }
  }

  // Fallback: DOM signals
  const html = doc.documentElement.innerHTML.toLowerCase();
  for (const signature of ATS_SIGNATURES) {
    if (signature.domSignals.some((signal) => html.includes(signal))) {
      return signature.key;
    }
  }

  // Meta tag check
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
  if (generator.toLowerCase().includes('greenhouse')) return 'greenhouse';
  if (generator.toLowerCase().includes('workday')) return 'workday';
  if (generator.toLowerCase().includes('taleo')) return 'taleo';

  return 'generic';
}
