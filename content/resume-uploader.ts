import { parseFileSizeLimit } from '../lib/utils.js';
import { waitForCondition, delay } from '../lib/wait.js';
import { logger } from '../lib/logger.js';
import { base64ToArrayBuffer } from '../lib/utils.js';
import type { DetectedField, UserProfile } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Resume Uploader — All 4 scenarios with base64 transfer
// PRD Reference: Section 15 (Resume Upload)
// ═══════════════════════════════════════════════════════════════

interface UploadResult {
  success: boolean;
  reason?: string;
  detail?: string;
}

export const resumeUploader = {
  async upload(profile: UserProfile, doc: Document, field?: DetectedField): Promise<UploadResult> {
    const fileInput = field
      ? (doc.querySelector(field.selector) as HTMLInputElement | null)
      : (doc.querySelector('input[type="file"]') as HTMLInputElement | null);

    if (fileInput) {
      const accepts = fileInput.getAttribute('accept') || '';
      if (accepts && !accepts.includes('.pdf') && !accepts.includes('application/pdf') && !accepts.includes('*')) {
        return { success: false, reason: 'FILE_TYPE_REJECTED', detail: `Accepts: ${accepts}` };
      }

      const labelText = fileInput.closest('label')?.textContent || '';
      const maxBytes = parseFileSizeLimit(labelText);
      if (maxBytes && profile.resume.size_bytes > maxBytes) {
        return { success: false, reason: 'FILE_SIZE_REJECTED', detail: `${maxBytes} bytes max` };
      }
    }

    // Scenario A: Native file input
    if (fileInput) {
      const result = await this.uploadNative(fileInput, profile);
      if (result.success) return result;
    }

    // Scenario B: React/Angular controlled input
    if (fileInput) {
      const result = await this.uploadControlled(fileInput, profile);
      if (result.success) return result;
    }

    // Scenario C: Drag-and-drop zone
    const dropResult = await this.uploadDragDrop(doc, profile);
    if (dropResult.success) return dropResult;

    return { success: false, reason: 'FILE_UPLOAD_FAIL', detail: 'All upload scenarios failed' };
  },

  async uploadNative(fileInput: HTMLInputElement, profile: UserProfile): Promise<UploadResult> {
    try {
      const fileData = await chrome.runtime.sendMessage({ type: 'GET_RESUME_FILE' });
      if (fileData.error) {
        return { success: false, reason: 'FILE_FETCH_FAIL', detail: fileData.error };
      }

      const buffer = base64ToArrayBuffer(fileData.base64);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const file = new File([blob], fileData.filename, { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      // Scenario D: async pre-submit upload detection
      const asyncComplete = await waitForCondition(
        () => {
          const uploading = document.querySelector(
            '[class*="uploading"], [class*="progress"], [aria-label*="uploading"], [class*="spinner"]'
          );
          const done = document.querySelector(
            '[class*="upload-success"], [class*="file-name"], [class*="uploaded"], [aria-label*="uploaded"]'
          );
          return !uploading && !!done;
        },
        { timeout: 30000, interval: 500 }
      );

      if (!asyncComplete) {
        return { success: false, reason: 'FILE_UPLOAD_TIMEOUT', detail: 'Async upload did not complete' };
      }

      return { success: true };
    } catch (err) {
      logger.error('ResumeUploader', 'Native upload failed', err);
      return { success: false, reason: 'FILE_UPLOAD_FAIL', detail: String(err) };
    }
  },

  async uploadControlled(fileInput: HTMLInputElement, profile: UserProfile): Promise<UploadResult> {
    const isReact = !!Object.keys(fileInput).find((k) => k.startsWith('__reactFiber'));
    const isAngular =
      fileInput.hasAttribute('ng-model') ||
      fileInput.hasAttribute('[(ngModel)]') ||
      !!document.querySelector('[ng-version]');

    if (!isReact && !isAngular) return { success: false, reason: 'NOT_CONTROLLED' };

    try {
      const fileData = await chrome.runtime.sendMessage({ type: 'GET_RESUME_FILE' });
      if (fileData.error) {
        return { success: false, reason: 'FILE_FETCH_FAIL', detail: fileData.error };
      }

      const buffer = base64ToArrayBuffer(fileData.base64);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const file = new File([blob], fileData.filename, { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
      if (!nativeSetter) {
        return { success: false, reason: 'FILE_UPLOAD_FAIL', detail: 'nativeSetter unavailable' };
      }

      nativeSetter.call(fileInput, dt.files);
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true };
    } catch (err) {
      logger.error('ResumeUploader', 'Controlled upload failed', err);
      return { success: false, reason: 'FILE_UPLOAD_FAIL', detail: String(err) };
    }
  },

  async uploadDragDrop(doc: Document, profile: UserProfile): Promise<UploadResult> {
    const hasFileInput = !!doc.querySelector('input[type="file"]');
    const dropZone = doc.querySelector(
      '[class*="dropzone"], [class*="drop-zone"], [class*="upload-area"], [data-dropzone], [aria-label*="upload"]'
    );

    if (hasFileInput || !dropZone) {
      return { success: false, reason: 'NO_DROPZONE' };
    }

    try {
      const fileData = await chrome.runtime.sendMessage({ type: 'GET_RESUME_FILE' });
      if (fileData.error) {
        return { success: false, reason: 'FILE_FETCH_FAIL', detail: fileData.error };
      }

      const buffer = base64ToArrayBuffer(fileData.base64);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const file = new File([blob], fileData.filename, { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);

      dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true }));
      dropZone.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      );
      dropZone.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      );

      await delay(500);
      return { success: true };
    } catch (err) {
      logger.error('ResumeUploader', 'Drag-drop upload failed', err);
      return { success: false, reason: 'FILE_UPLOAD_FAIL', detail: String(err) };
    }
  },
};
