import { randomDelay, typeText, scrollToElement, isVisible } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import type { FieldMapping, FillResult } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Field Filler — Executes DOM interactions per field type
// PRD Reference: Section 14 (Field Handling)
// ═══════════════════════════════════════════════════════════════

export const fieldFiller = {
  async fill(mapping: FieldMapping): Promise<FillResult> {
    const { field, value } = mapping;
    const el = document.querySelector(field.selector);
    if (!el || !isVisible(el)) {
      return { success: false, field, error: 'Element not found or not visible' };
    }

    scrollToElement(el);
    await randomDelay(config.fieldDelayMin, config.fieldDelayMax);

    try {
      switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
        case 'number':
          await this.fillText(el as HTMLInputElement, String(value));
          break;
        case 'textarea':
          await this.fillTextarea(el as HTMLTextAreaElement, String(value));
          break;
        case 'select':
          await this.fillSelect(el as HTMLSelectElement, String(value));
          break;
        case 'radio':
          await this.fillRadio(field.selector, String(value));
          break;
        case 'checkbox':
          await this.fillCheckbox(field, value);
          break;
        case 'date':
          await this.fillDate(el as HTMLInputElement, String(value));
          break;
        case 'richtext':
          await this.fillRichText(el as HTMLElement, String(value));
          break;
        case 'custom-dropdown':
          await this.fillCustomDropdown(el as HTMLElement, String(value));
          break;
        default:
          return { success: false, field, error: `Unsupported field type: ${field.type}` };
      }
      return { success: true, field };
    } catch (err) {
      logger.warn('FieldFiller', `Failed to fill ${field.label}`, err);
      return { success: false, field, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async fillText(element: HTMLInputElement, value: string): Promise<void> {
    element.focus();
    if (value.length > config.typingThreshold) {
      await typeText(element, value, config.typingCharDelayMin, config.typingCharDelayMax);
    } else {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }
    element.blur();
  },

  async fillTextarea(element: HTMLTextAreaElement, value: string): Promise<void> {
    element.focus();
    if (value.length > 150) {
      await typeText(element, value, config.typingCharDelayMin, config.typingCharDelayMax);
    } else {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }
    element.blur();
  },

  async fillSelect(element: HTMLSelectElement, value: string): Promise<void> {
    element.focus();
    element.value = value;

    if (!element.value && element.options.length > 0) {
      let bestOption: HTMLOptionElement | null = null;
      let bestScore = Infinity;
      const target = value.toLowerCase().trim();

      for (let i = 0; i < element.options.length; i++) {
        const opt = element.options[i];
        const text = opt.text.toLowerCase().trim();
        if (text === target) {
          bestOption = opt;
          break;
        }
        if (text.includes(target) || target.includes(text)) {
          const score = Math.abs(text.length - target.length);
          if (score < bestScore) {
            bestScore = score;
            bestOption = opt;
          }
        }
      }

      if (bestOption) {
        element.value = bestOption.value;
      }
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  },

  async fillRadio(selector: string, value: string): Promise<void> {
    const radios = document.querySelectorAll<HTMLInputElement>(selector);
    const target = value.toLowerCase().trim();

    for (const radio of Array.from(radios)) {
      const labelEl = radio.labels?.[0];
      const labelText = labelEl?.textContent?.toLowerCase().trim() || '';
      const radioValue = radio.value.toLowerCase().trim();

      if (labelText === target || radioValue === target || fuzzyBooleanMatch(labelText, target)) {
        radio.scrollIntoView({ block: 'center' });
        await randomDelay(50, 150);
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
  },

  async fillCheckbox(field: FieldMapping['field'], value: unknown): Promise<void> {
    const boxes = document.querySelectorAll<HTMLInputElement>(field.selector);
    const boxesArray = Array.from(boxes);

    if (typeof value === 'boolean') {
      const box = boxesArray[0];
      if (!box) return;
      if (value && !box.checked) {
        box.scrollIntoView({ block: 'center' });
        await randomDelay(50, 150);
        box.click();
      } else if (!value && box.checked) {
        box.scrollIntoView({ block: 'center' });
        await randomDelay(50, 150);
        box.click();
      }
    } else if (Array.isArray(value)) {
      const targets = value.map((v) => String(v).toLowerCase().trim());
      for (const box of boxesArray) {
        const labelEl = box.labels?.[0];
        const labelText = labelEl?.textContent?.toLowerCase().trim() || '';
        const boxValue = box.value.toLowerCase().trim();
        const shouldCheck = targets.some(
          (t) => labelText === t || boxValue === t || labelText.includes(t) || t.includes(labelText)
        );
        if (shouldCheck && !box.checked) {
          box.scrollIntoView({ block: 'center' });
          await randomDelay(50, 150);
          box.click();
        }
      }
    }
  },

  async fillDate(element: HTMLInputElement, value: string): Promise<void> {
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  },

  async fillRichText(element: HTMLElement, value: string): Promise<void> {
    element.focus();
    if (element.isContentEditable) {
      document.execCommand('selectAll');
      document.execCommand('insertText', false, value);
    } else {
      const iframe = element.querySelector('iframe');
      if (iframe?.contentDocument?.body) {
        iframe.contentDocument.body.innerHTML = value;
      }
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.blur();
  },

  async fillCustomDropdown(element: HTMLElement, value: string): Promise<void> {
    const input = element.querySelector('input') ?? (element as HTMLInputElement);
    if (!input) return;

    const container =
      element.closest('[class*="control"], [class*="container"]') ||
      element.closest('[class*="select"]');
    container?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await randomDelay(200, 400);

    (input as HTMLInputElement).focus();
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await randomDelay(300, 500);

    const menu = document.querySelector('[class*="menu"], [class*="dropdown"], [role="listbox"]');
    if (menu) {
      const options = menu.querySelectorAll('[class*="option"], [role="option"]');
      const target = value.toLowerCase().trim();
      for (const opt of Array.from(options)) {
        const text = opt.textContent?.toLowerCase().trim() || '';
        if (text === target || text.includes(target)) {
          (opt as HTMLElement).click();
          break;
        }
      }
    }
  },
};

function fuzzyBooleanMatch(label: string, value: string): boolean {
  const yesPatterns = ['yes', 'agree', 'accept', 'true'];
  const noPatterns = ['no', 'disagree', 'decline', 'false'];
  if (yesPatterns.some((p) => label.includes(p)) && yesPatterns.some((p) => value.includes(p)))
    return true;
  if (noPatterns.some((p) => label.includes(p)) && noPatterns.some((p) => value.includes(p)))
    return true;
  return false;
}
