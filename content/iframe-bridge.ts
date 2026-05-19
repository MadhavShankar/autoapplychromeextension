import { logger } from '../lib/logger.js';

// ═══════════════════════════════════════════════════════════════
// iFrame Bridge — Cross-origin frame communication for ATSes
// that embed forms inside iFrames (Workday, Taleo, SuccessFactors).
//
// Strategy:
// 1. Content script runs in ALL frames (allFrames: true)
// 2. Parent frame detects iFrames and injects bridge script
// 3. Child frames report their fields up to parent via postMessage
// 4. Parent aggregates fields and sends single JOB_RESULT back
//
// PRD Reference: Section 13 (iFrame handling)
// ═══════════════════════════════════════════════════════════════

const BRIDGE_MSG_ORIGIN = window.location.origin;
const BRIDGE_MSG_TYPE = 'WISOOWL_IFRAME_BRIDGE';

interface IFrameFieldReport {
  type: 'FIELDS_REPORT';
  frameId: string;
  fields: Array<{
    selector: string;
    label: string;
    type: string;
    required: boolean;
    options: string[];
    placeholder: string | null;
    max_length: number;
    accepts: string | null;
  }>;
  url: string;
}

interface IFrameFillCommand {
  type: 'FILL_COMMAND';
  frameId: string;
  mapping: {
    selector: string;
    value: string | string[] | boolean | null;
    fieldType: string;
  };
}

// Unique ID for this frame
const FRAME_ID = Math.random().toString(36).slice(2, 10);
let isBridgeInitialized = false;

// ── Detect if we are inside an iFrame ──
export function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent access throws
    return true;
  }
}

// ── Initialize bridge ──
export function initIframeBridge(): void {
  if (isBridgeInitialized) return;
  isBridgeInitialized = true;

  if (isInsideIframe()) {
    // We are in a child frame — listen for fill commands, report fields up
    listenAsChildFrame();
  } else {
    // We are in the parent — listen for field reports from children
    listenAsParentFrame();
  }
}

// ── Child frame: report fields to parent ──
export function reportFieldsToParent(fields: IFrameFieldReport['fields']): void {
  if (!isInsideIframe()) return;

  const report: IFrameFieldReport = {
    type: 'FIELDS_REPORT',
    frameId: FRAME_ID,
    fields,
    url: window.location.href,
  };

  try {
    window.parent.postMessage(
      { bridge: BRIDGE_MSG_TYPE, payload: report },
      '*'
    );
    logger.debug('IframeBridge', 'Reported fields to parent', { count: fields.length });
  } catch (err) {
    logger.warn('IframeBridge', 'Failed to report fields', err);
  }
}

// ── Child frame: listen for fill commands ──
function listenAsChildFrame(): void {
  window.addEventListener('message', (event) => {
    if (event.data?.bridge !== BRIDGE_MSG_TYPE) return;
    const cmd = event.data.payload as IFrameFillCommand;
    if (cmd?.type !== 'FILL_COMMAND' || cmd.frameId !== FRAME_ID) return;

    logger.debug('IframeBridge', 'Received fill command in child frame', cmd.mapping);

    try {
      const el = document.querySelector(cmd.mapping.selector) as HTMLElement | null;
      if (!el) return;

      const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (cmd.mapping.fieldType === 'checkbox' || cmd.mapping.fieldType === 'radio') {
        (inputEl as HTMLInputElement).checked = Boolean(cmd.mapping.value);
      } else if (cmd.mapping.fieldType === 'select' || cmd.mapping.fieldType === 'custom-dropdown') {
        inputEl.value = String(cmd.mapping.value);
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        inputEl.value = String(cmd.mapping.value ?? '');
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Notify parent of success
      window.parent.postMessage(
        {
          bridge: BRIDGE_MSG_TYPE,
          payload: { type: 'FILL_ACK', frameId: FRAME_ID, selector: cmd.mapping.selector },
        },
        '*'
      );
    } catch (err) {
      logger.warn('IframeBridge', 'Fill command failed in child', err);
    }
  });
}

// ── Parent frame: collect field reports from children ──
function listenAsParentFrame(): void {
  window.addEventListener('message', (event) => {
    if (event.data?.bridge !== BRIDGE_MSG_TYPE) return;
    const payload = event.data.payload;

    if (payload?.type === 'FIELDS_REPORT') {
      logger.debug('IframeBridge', 'Received field report from child', {
        frameId: payload.frameId,
        count: payload.fields?.length ?? 0,
      });

      // Store in a global registry for form-agent.ts to pick up
      (window as any).__wisowlIframeFields = (window as any).__wisowlIframeFields ?? {};
      (window as any).__wisowlIframeFields[payload.frameId] = {
        url: payload.url,
        fields: payload.fields,
      };
    }

    if (payload?.type === 'FILL_ACK') {
      logger.debug('IframeBridge', 'Child acknowledged fill', payload);
    }
  });
}

// ── Parent: send fill command to specific frame ──
export function sendFillToFrame(
  frameId: string,
  mapping: IFrameFillCommand['mapping']
): void {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            bridge: BRIDGE_MSG_TYPE,
            payload: { type: 'FILL_COMMAND', frameId, mapping } as IFrameFillCommand,
          },
          '*'
        );
      }
    } catch {
      // Cross-origin iframe may throw on contentWindow access
      logger.warn('IframeBridge', 'Cannot access iframe contentWindow (cross-origin)');
    }
  }
}

// ── Parent: get aggregated iframe fields ──
export function getAggregatedIframeFields(): Array<{
  frameId: string;
  url: string;
  fields: IFrameFieldReport['fields'];
}> {
  const registry = (window as any).__wisowlIframeFields ?? {};
  return Object.entries(registry).map(([frameId, data]: [string, any]) => ({
    frameId,
    url: data.url,
    fields: data.fields ?? [],
  }));
}

// ── Detect if page has cross-origin iFrames ──
export function hasCrossOriginIframes(): boolean {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      // If we can access contentDocument, it's same-origin
      const doc = iframe.contentDocument;
      if (!doc) return true; // cross-origin or sandboxed
    } catch {
      return true; // cross-origin
    }
  }
  return false;
}
