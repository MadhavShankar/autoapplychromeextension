import type {
  WorkerMessage,
  ContentMessage,
  BackgroundResponseMessage,
} from '../types/index.js';
import { logger } from './logger.js';

// ═══════════════════════════════════════════════════════════════
// Typed chrome.runtime message definitions with validation
// ═══════════════════════════════════════════════════════════════

const MSG_TIMEOUT_MS = 30_000;

// ── Popup / Content → Background Worker ──

export function sendToWorker(message: WorkerMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout: background did not respond'));
    }, MSG_TIMEOUT_MS);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function listenForWorkerMessages(
  handler: (message: WorkerMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void | boolean | Promise<unknown>
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.debug('Messages', 'Worker received', { type: (message as Record<string, unknown>)?.type });
    const result = handler(message as WorkerMessage, sender, sendResponse);
    if (result instanceof Promise) {
      result.then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
      return true;
    }
    return result as boolean | void;
  });
}

// ── Background Worker → Content Script ──

export function sendToContent(tabId: number, message: ContentMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timeout: content script in tab ${tabId} did not respond`));
    }, MSG_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function listenForContentMessages(
  handler: (message: ContentMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void | boolean | Promise<unknown>
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.debug('Messages', 'Content received', { type: (message as Record<string, unknown>)?.type, tab: sender.tab?.id });
    const result = handler(message as ContentMessage, sender, sendResponse);
    if (result instanceof Promise) {
      result.then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
      return true;
    }
    return result as boolean | void;
  });
}

// ── Background Worker → Popup ──

export function broadcastToPopup(message: BackgroundResponseMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may be closed; ignore errors silently
  });
}

export function listenForPopupMessages(
  handler: (message: BackgroundResponseMessage) => void
): void {
  chrome.runtime.onMessage.addListener((message) => {
    handler(message as BackgroundResponseMessage);
  });
}

// ── External: WisOwl Web App → Background Worker ──

export function listenForExternalMessages(
  handler: (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void | boolean | Promise<unknown>
): void {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    logger.info('Messages', 'External message', { origin: sender.origin });
    const result = handler(message, sender, sendResponse);
    if (result instanceof Promise) {
      result.then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
      return true;
    }
    return result as boolean | void;
  });
}
