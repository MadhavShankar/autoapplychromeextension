// ═══════════════════════════════════════════════════════════════
// CAPTCHA Detector — Pre-fill and post-submit detection
// PRD Reference: Section 18, Section 21 (CAPTCHA error handling)
// ═══════════════════════════════════════════════════════════════

export const captchaDetector = {
  isPresent(doc: Document): boolean {
    // reCAPTCHA v2
    const recaptchaFrames = doc.querySelectorAll(
      'iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]'
    );
    if (recaptchaFrames.length > 0) return true;

    // hCaptcha
    const hcaptchaFrames = doc.querySelectorAll(
      'iframe[src*="hcaptcha.com"], [data-hcaptcha-widget-id]'
    );
    if (hcaptchaFrames.length > 0) return true;

    // reCAPTCHA enterprise / implicit
    const recaptchaDivs = doc.querySelectorAll('.g-recaptcha, [data-sitekey]');
    if (recaptchaDivs.length > 0) return true;

    // hCaptcha implicit
    const hcaptchaDivs = doc.querySelectorAll('.h-captcha');
    if (hcaptchaDivs.length > 0) return true;

    // Turnstile (Cloudflare)
    const turnstile = doc.querySelectorAll(
      'iframe[src*="challenges.cloudflare"], [data-cf-turnstile]'
    );
    if (turnstile.length > 0) return true;

    return false;
  },

  isSolved(doc: Document): boolean {
    const recaptchaCheckbox = doc.querySelector('.recaptcha-checkbox-checked');
    if (recaptchaCheckbox) return true;

    const hcaptchaSuccess = doc.querySelector('[data-hcaptcha-response]:not([data-hcaptcha-response=""])');
    if (hcaptchaSuccess) return true;

    return false;
  },
};
