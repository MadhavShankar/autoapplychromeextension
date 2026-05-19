import { waitForDomReady, randomDelay, withTimeout } from '../lib/wait.js';
import { scrollToElement } from '../lib/utils.js';
import { detectATS } from '../ats/detector.js';
import { getStrategy } from '../ats/strategy-loader.js';
import { fieldDetector } from './field-detector.js';
import { fieldMapper } from './field-mapper.js';
import { fieldFiller } from './field-filler.js';
import { resumeUploader } from './resume-uploader.js';
import { dynamicWatcher } from './dynamic-watcher.js';
import { submitHandler } from './submit-handler.js';
import { captchaDetector } from './captcha-detector.js';
import {
  initIframeBridge,
  isInsideIframe,
  hasCrossOriginIframes,
  reportFieldsToParent,
  getAggregatedIframeFields,
  sendFillToFrame,
} from './iframe-bridge.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import type {
  JobQueueItem,
  UserProfile,
  ApplicationRecord,
  FieldMapping,
  ErrorCode,
  DetectedField,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Form Agent — Production Content Script Entry Point
// PRD Reference: Section 11 (Components), Section 13 (Flow)
// ═══════════════════════════════════════════════════════════════

interface FormAgentContext {
  job: JobQueueItem;
  profile: UserProfile;
  atsKey: string;
  record: ApplicationRecord;
  processedSelectors: Set<string>;
}

export async function runFormAgent(job: JobQueueItem, profile: UserProfile): Promise<ApplicationRecord> {
  const startTime = Date.now();
  const record: ApplicationRecord = {
    job_id: job.job_id,
    session_id: '', // filled by worker
    status: 'running',
    apply_url: job.apply_url,
    ats_detected: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_ms: 0,
    fields_total: 0,
    fields_filled: 0,
    fields_skipped: 0,
    fail_reason: null,
    fail_detail: null,
    confirmation: null,
    needs_review_reasons: [],
  };

  const context: FormAgentContext = {
    job,
    profile,
    atsKey: 'generic',
    record,
    processedSelectors: new Set(),
  };

  try {
    logger.info('FormAgent', `Starting job ${job.job_id}`, { url: job.apply_url });

    // 1. Wait for DOM ready
    await waitForDomReady(config.maxDomWaitMs);
    await randomDelay(300, 800);

    // Initialize iFrame bridge (no-op if not in relevant context)
    initIframeBridge();

    // If we are inside an iframe, report fields to parent and stop
    if (isInsideIframe()) {
      const iframeFields = fieldDetector.detect(document);
      reportFieldsToParent(iframeFields);
      logger.info('FormAgent', 'Running inside iframe, reported fields to parent');
      // Child frames do not process jobs independently
      return finalize(record, startTime);
    }

    // 2. Detect ATS and load strategy
    const atsResult = detectATS(window.location.href, document);
    context.atsKey = atsResult;
    record.ats_detected = atsResult;
    const strategy = getStrategy(atsResult);
    logger.info('FormAgent', `ATS detected: ${atsResult}`);

    // Run strategy beforeFill hook
    if (strategy.beforeFill) {
      await strategy.beforeFill();
    }

    // 3. LinkedIn Easy Apply — click the button to open modal
    if (atsResult === 'linkedin') {
      const easyApplyBtn = findLinkedInEasyApplyButton(document);
      if (easyApplyBtn) {
        logger.info('FormAgent', 'Clicking LinkedIn Easy Apply button');
        easyApplyBtn.click();
        await randomDelay(1500, 2500);
        // Wait for modal to appear
        let attempts = 0;
        while (!document.querySelector('.jobs-easy-apply-modal, [role="dialog"]') && attempts < 10) {
          await randomDelay(500, 800);
          attempts++;
        }
        if (!document.querySelector('.jobs-easy-apply-modal, [role="dialog"]')) {
          logger.warn('FormAgent', 'LinkedIn Easy Apply modal did not open');
          record.status = 'needs_review';
          record.fail_reason = 'NO_FORM';
          record.fail_detail = 'LinkedIn Easy Apply modal did not open';
          return finalize(record, startTime);
        }
      } else {
        logger.warn('FormAgent', 'LinkedIn Easy Apply button not found');
        record.status = 'needs_review';
        record.fail_reason = 'NO_FORM';
        record.fail_detail = 'Easy Apply button not found on page';
        return finalize(record, startTime);
      }
    }

    // 4. Pre-fill CAPTCHA check
    if (captchaDetector.isPresent(document)) {
      logger.warn('FormAgent', 'CAPTCHA detected before fill');
      await chrome.runtime.sendMessage({ type: 'PAUSE_SESSION' });
      return record;
    }

    // 5. Login / registration wall detection
    if (detectLoginWall(document)) {
      logger.warn('FormAgent', 'Login wall detected');
      record.status = 'needs_review';
      record.fail_reason = 'LOGIN_REQUIRED';
      record.fail_detail = 'Login or account creation required';
      return finalize(record, startTime);
    }

    // 6. Parse-from-resume check
    const hasResumeUploadFirst = detectParseFromResumePortal(document);
    if (hasResumeUploadFirst) {
      logger.info('FormAgent', 'Parse-from-resume portal detected');
      const uploadResult = await resumeUploader.upload(profile, document);
      if (!uploadResult.success) {
        record.status = 'needs_review';
      record.fail_reason = uploadResult.reason as ErrorCode;
      record.fail_detail = uploadResult.detail ?? null;
        record.needs_review_reasons.push('resume upload');
        return finalize(record, startTime);
      }
      await randomDelay(3000, 3500); // wait for autofill
    }

    // 7. Main filling loop
    let pageCount = 0;
    while (pageCount < config.maxPagesPerForm) {
      const pageResult = await processPage(context, strategy);
      if (!pageResult.hasNext) break;
      pageCount++;
    }

    // Check if any required fields were skipped
    const hasUnmappedRequired = record.needs_review_reasons.length > 0;
    if (hasUnmappedRequired) {
      logger.warn('FormAgent', 'Required fields unmapped, skipping submit', {
        reasons: record.needs_review_reasons,
      });
      record.status = 'needs_review';
      record.fail_reason = 'FIELD_UNMAPPABLE';
      record.fail_detail = `Unmapped required fields: ${record.needs_review_reasons.join(', ')}`;
      return finalize(record, startTime);
    }

    // 7. Submit
    logger.info('FormAgent', 'Attempting submit');
    const submitResult = await submitHandler.submit(document, window.location.href);
    if (!submitResult.success) {
      record.status = submitResult.reason === 'VALIDATION_ERROR' ? 'failed' : 'needs_review';
      record.fail_reason = submitResult.reason as ErrorCode;
      record.fail_detail = submitResult.detail ?? 'Submit failed';
      return finalize(record, startTime);
    }

    record.confirmation = submitResult.confirmation;
    record.status = 'applied';
    logger.info('FormAgent', 'Job applied successfully', { job_id: job.job_id });
    return finalize(record, startTime);
  } catch (err) {
    logger.error('FormAgent', 'Unhandled error', err);
    record.status = 'failed';
    record.fail_reason = 'NO_FORM';
    record.fail_detail = err instanceof Error ? err.message : String(err);
    return finalize(record, startTime);
  }
}

async function processPage(
  context: FormAgentContext,
  strategy: ReturnType<typeof getStrategy>
): Promise<{ hasNext: boolean }> {
  let fields = strategy.detectFields
    ? strategy.detectFields(document)
    : fieldDetector.detect(document);

  // ── iFrame field aggregation ──
  const iframeReports = getAggregatedIframeFields();
  let iframeFields: DetectedField[] = [];
  for (const report of iframeReports) {
    for (const f of report.fields) {
      iframeFields.push({
        ...f,
        selector: `iframe::${report.frameId}::${f.selector}`,
        type: f.type as import('../types/index.js').FieldType,
      });
    }
  }

  if (iframeFields.length > 0) {
    logger.debug('FormAgent', `Aggregated ${iframeFields.length} fields from ${iframeReports.length} iframes`);
    fields = fields.concat(iframeFields);
  }

  const unprocessed = fields.filter((f) => !context.processedSelectors.has(f.selector));

  if (unprocessed.length === 0 && iframeReports.length === 0) {
    return { hasNext: false };
  }

  // If we only have iframe fields and they are cross-origin blocked
  if (unprocessed.length === 0 && hasCrossOriginIframes() && iframeReports.length === 0) {
    logger.warn('FormAgent', 'Cross-origin iFrames detected but fields could not be accessed');
    context.record.status = 'needs_review';
    context.record.fail_reason = 'IFRAME_BLOCKED';
    context.record.fail_detail = 'Form fields are inside cross-origin iFrames';
    return { hasNext: false };
  }

  context.record.fields_total += unprocessed.length;
  logger.debug('FormAgent', `Detected ${unprocessed.length} new fields`);

  const mappings = fieldMapper.mapFields(unprocessed, context.job, context.profile);

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    if (context.processedSelectors.has(mapping.field.selector)) continue;

    if (context.processedSelectors.size >= config.maxFieldsPerPage) {
      context.record.status = 'needs_review';
      context.record.fail_reason = 'DYNAMIC_FIELD_OVERFLOW';
      context.record.fail_detail = `Exceeded ${config.maxFieldsPerPage} fields per page`;
      return { hasNext: false };
    }

    context.processedSelectors.add(mapping.field.selector);

    // ── iFrame field handling ──
    const isIframeField = mapping.field.selector.startsWith('iframe::');
    if (isIframeField) {
      const parts = mapping.field.selector.split('::');
      const frameId = parts[1];
      const innerSelector = parts[2];

      if (mapping.value != null) {
        sendFillToFrame(frameId, {
          selector: innerSelector,
          value: mapping.value,
          fieldType: mapping.field.type,
        });
        context.record.fields_filled++;
      } else if (mapping.field.required) {
        context.record.fields_skipped++;
        context.record.needs_review_reasons.push(mapping.field.label);
      } else {
        context.record.fields_skipped++;
      }
      continue;
    }

    // Handle resume upload fields
    if (mapping.field.type === 'file') {
      const uploadResult = await resumeUploader.upload(context.profile, document, mapping.field);
      if (!uploadResult.success) {
        context.record.fields_skipped++;
        if (mapping.field.required) {
          context.record.needs_review_reasons.push(mapping.field.label);
        }
        continue;
      }
      context.record.fields_filled++;
      continue;
    }

    // Handle fields with a mapped value
    if (mapping.value != null) {
      const fillResult = await fieldFiller.fill(mapping);
      if (fillResult.success) {
        context.record.fields_filled++;
      } else {
        context.record.fields_skipped++;
        if (mapping.field.required) {
          context.record.needs_review_reasons.push(mapping.field.label);
        }
      }

      // Strategy afterFieldFill hook
      if (strategy.afterFieldFill) {
        await strategy.afterFieldFill(mapping.field);
      }

      // Wait for dynamic fields
      await randomDelay(config.fieldDelayMin, config.fieldDelayMax);
      const newFields = await dynamicWatcher.watchForNewFields(document, context.processedSelectors);
      if (newFields.length > 0) {
        logger.debug('FormAgent', `Dynamic fields revealed: ${newFields.length}`);
        const newMappings = fieldMapper.mapFields(newFields, context.job, context.profile);
        mappings.push(...newMappings);
      }
      continue;
    }

    // Unmapped field — try LLM for required fields
    if (mapping.field.required) {
      try {
        const llmResult = await withTimeout(
          fieldMapper.mapWithLLM(mapping.field, context.job, context.profile),
          15000,
          'llm-assist'
        );
        if (llmResult.value && llmResult.confidence !== 'low') {
          const llmMapping: FieldMapping = {
            field: mapping.field,
            value: llmResult.value,
            source: 'llm',
            confidence: llmResult.confidence,
          };
          const fillResult = await fieldFiller.fill(llmMapping);
          if (fillResult.success) {
            context.record.fields_filled++;
            continue;
          }
        }
      } catch {
        // LLM fallback failed
      }
      context.record.needs_review_reasons.push(mapping.field.label);
    }

    context.record.fields_skipped++;
  }

  // Check for Next/Continue button (strategy-aware)
  const nextBtn = strategy.detectNextButton
    ? strategy.detectNextButton(document)
    : submitHandler.detectNextButton(document);

  if (nextBtn) {
    scrollToElement(nextBtn);
    await randomDelay(300, 700);
    nextBtn.click();
    await randomDelay(1500, 2500);
    return { hasNext: true };
  }

  return { hasNext: false };
}

function findLinkedInEasyApplyButton(doc: Document): HTMLElement | null {
  const selectors = [
    'button[aria-label*="Easy Apply"]',
    'button:has-text("Easy Apply")',
    'button.jobs-apply-button',
    'button[data-control-name="jobdetails_topcard_inapply"]',
  ];
  for (const selector of selectors) {
    try {
      const btn = doc.querySelector(selector) as HTMLElement | null;
      if (btn) return btn;
    } catch {
      // ignore unsupported selectors
    }
  }
  // Fallback: any button containing "Easy Apply" text
  const allButtons = doc.querySelectorAll('button');
  for (const btn of Array.from(allButtons)) {
    const text = (btn.textContent || '').trim().toLowerCase();
    if (text.includes('easy apply')) return btn as HTMLElement;
  }
  return null;
}

function detectLoginWall(doc: Document): boolean {
  const text = doc.body?.innerText?.toLowerCase() ?? '';
  const loginPatterns = [
    /sign in to apply/i,
    /login to continue/i,
    /create an account/i,
    /register to apply/i,
    /authentication required/i,
  ];
  return loginPatterns.some((p) => p.test(text));
}

function detectParseFromResumePortal(doc: Document): boolean {
  const fileInputs = doc.querySelectorAll('input[type="file"]');
  if (fileInputs.length !== 1) return false;
  const fileInput = fileInputs[0];
  const rect = fileInput.getBoundingClientRect();
  if (rect.top < 400) {
    const visibleInputs = doc.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );
    let visibleCount = 0;
    visibleInputs.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') visibleCount++;
    });
    return visibleCount <= 4;
  }
  return false;
}

function finalize(record: ApplicationRecord, startTime: number): ApplicationRecord {
  record.completed_at = new Date().toISOString();
  record.duration_ms = Date.now() - startTime;
  if (record.needs_review_reasons.length > 0 && record.status !== 'failed') {
    record.status = 'needs_review';
  }
  return record;
}

// ── Message listener for injection from worker ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'INJECT_JOB') {
    const { job, profile } = message as { job: JobQueueItem; profile: UserProfile };
    runFormAgent(job, profile)
      .then((record) => {
        chrome.runtime.sendMessage({ type: 'JOB_RESULT', record }, () => {
          // best effort
        });
        sendResponse({ ok: true });
      })
      .catch((err) => {
        sendResponse({ error: String(err) });
      });
    return true; // keep channel open for async
  }
});
