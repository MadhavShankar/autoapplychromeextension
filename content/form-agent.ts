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
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import type {
  JobQueueItem,
  UserProfile,
  ApplicationRecord,
  FieldMapping,
  ErrorCode,
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

    // 3. Pre-fill CAPTCHA check
    if (captchaDetector.isPresent(document)) {
      logger.warn('FormAgent', 'CAPTCHA detected before fill');
      await chrome.runtime.sendMessage({ type: 'PAUSE_SESSION' });
      return record;
    }

    // 4. Login / registration wall detection
    if (detectLoginWall(document)) {
      logger.warn('FormAgent', 'Login wall detected');
      record.status = 'needs_review';
      record.fail_reason = 'LOGIN_REQUIRED';
      record.fail_detail = 'Login or account creation required';
      return finalize(record, startTime);
    }

    // 5. Parse-from-resume check
    const hasResumeUploadFirst = detectParseFromResumePortal(document);
    if (hasResumeUploadFirst) {
      logger.info('FormAgent', 'Parse-from-resume portal detected');
      const uploadResult = await resumeUploader.upload(profile, document);
      if (!uploadResult.success) {
        record.status = 'needs_review';
        record.fail_reason = uploadResult.reason as ErrorCode;
        record.fail_detail = uploadResult.detail;
        record.needs_review_reasons.push('resume upload');
        return finalize(record, startTime);
      }
      await randomDelay(3000, 3500); // wait for autofill
    }

    // 6. Main filling loop
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
  const fields = strategy.detectFields
    ? strategy.detectFields(document)
    : fieldDetector.detect(document);

  const unprocessed = fields.filter((f) => !context.processedSelectors.has(f.selector));

  if (unprocessed.length === 0) {
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
