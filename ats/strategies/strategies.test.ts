import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kekaStrategy } from '../../ats/strategies/keka';
import { freshteamStrategy } from '../../ats/strategies/freshteam';
import { successFactorsStrategy } from '../../ats/strategies/successfactors';
import { linkedinStrategy } from '../../ats/strategies/linkedin';
import { naukriIndeedStrategy } from '../../ats/strategies/naukri-indeed';
import { genericStrategy } from '../../ats/strategies/generic';

describe('ATS Strategies', () => {
  function createDoc(html: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  describe('kekaStrategy', () => {
    it('has correct key and name', () => {
      expect(kekaStrategy.key).toBe('keka');
      expect(kekaStrategy.name).toBe('Keka');
    });

    it('detects Keka submit button by class', () => {
      const doc = createDoc(`
        <form>
          <button type="submit" class="btn-primary">Submit Application</button>
        </form>
      `);
      const btn = kekaStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
      expect(btn?.tagName.toLowerCase()).toBe('button');
    });

    it('falls back to generic strategy when no Keka button found', () => {
      const doc = createDoc(`<form></form>`);
      const btn = kekaStrategy.detectSubmitButton!(doc);
      expect(btn).toBeNull();
    });

    it('detects confirmation page text', () => {
      const doc = createDoc(`<body>Your application has been submitted successfully</body>`);
      expect(kekaStrategy.detectConfirmation!(doc, '')).toBe(true);
    });
  });

  describe('freshteamStrategy', () => {
    it('has correct key and name', () => {
      expect(freshteamStrategy.key).toBe('freshteam');
      expect(freshteamStrategy.name).toBe('Freshteam');
    });

    it('detects Freshteam submit button', () => {
      const doc = createDoc(`
        <form>
          <button class="fresh-button">Submit Application</button>
        </form>
      `);
      const btn = freshteamStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects Next button by text', () => {
      const doc = createDoc(`
        <form>
          <button>Save and Continue</button>
        </form>
      `);
      const btn = freshteamStrategy.detectNextButton!(doc);
      expect(btn).not.toBeNull();
    });
  });

  describe('successFactorsStrategy', () => {
    it('has correct key and name', () => {
      expect(successFactorsStrategy.key).toBe('successfactors');
      expect(successFactorsStrategy.name).toBe('SAP SuccessFactors');
    });

    it('detects SAP submit button by data attribute', () => {
      const doc = createDoc(`
        <form>
          <button data-sf-action="submit">Submit</button>
        </form>
      `);
      const btn = successFactorsStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects Next button by title', () => {
      const doc = createDoc(`
        <form>
          <button title="Next">Next Step</button>
        </form>
      `);
      const btn = successFactorsStrategy.detectNextButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('runs beforeFill hook without error', async () => {
      const start = Date.now();
      await successFactorsStrategy.beforeFill!();
      expect(Date.now() - start).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('linkedinStrategy', () => {
    it('has correct key and name', () => {
      expect(linkedinStrategy.key).toBe('linkedin');
      expect(linkedinStrategy.name).toBe('LinkedIn Easy Apply');
    });

    it('detects submit button inside modal', () => {
      const doc = createDoc(`
        <div class="jobs-easy-apply-modal">
          <button aria-label="Submit application">Submit</button>
        </div>
      `);
      const btn = linkedinStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('returns null when modal is absent', () => {
      const doc = createDoc(`<body><button>Submit</button></body>`);
      const btn = linkedinStrategy.detectSubmitButton!(doc);
      expect(btn).toBeNull();
    });

    it('detects confirmation inside modal text', () => {
      const doc = createDoc(`
        <div class="jobs-easy-apply-modal">
          Your application was sent successfully.
        </div>
      `);
      expect(linkedinStrategy.detectConfirmation!(doc, '')).toBe(true);
    });

    it('detects confirmation from body toast', () => {
      const doc = createDoc(`<body>Application sent</body>`);
      expect(linkedinStrategy.detectConfirmation!(doc, '')).toBe(true);
    });
  });

  describe('naukriIndeedStrategy', () => {
    it('has correct key and name', () => {
      expect(naukriIndeedStrategy.key).toBe('naukri_indeed');
      expect(naukriIndeedStrategy.name).toBe('Naukri / Indeed');
    });

    it('detects Apply Now link', () => {
      const doc = createDoc(`
        <a href="#">Apply Now</a>
      `);
      const btn = naukriIndeedStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects generic submit button as fallback', () => {
      const doc = createDoc(`
        <button type="submit">Send Application</button>
      `);
      const btn = naukriIndeedStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects confirmation text', () => {
      const doc = createDoc(`<body>Your application has been submitted</body>`);
      expect(naukriIndeedStrategy.detectConfirmation!(doc, '')).toBe(true);
    });
  });

  describe('genericStrategy', () => {
    it('detects submit by text patterns', () => {
      const doc = createDoc(`<button>Complete Application</button>`);
      const btn = genericStrategy.detectSubmitButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects next by text patterns', () => {
      const doc = createDoc(`<button>Save & Continue</button>`);
      const btn = genericStrategy.detectNextButton!(doc);
      expect(btn).not.toBeNull();
    });

    it('detects confirmation by URL', () => {
      const doc = createDoc(`<body></body>`);
      expect(genericStrategy.detectConfirmation!(doc, '/application-success')).toBe(true);
    });
  });
});
