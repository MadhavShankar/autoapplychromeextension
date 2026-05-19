import { normalize, isVisible } from '../lib/utils.js';
import type { DetectedField, FieldType } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Field Detector — DOM scanning for form fields
// PRD Reference: Section 11 (field-detector.ts)
// ═══════════════════════════════════════════════════════════════

export const fieldDetector = {
  detect(doc: Document): DetectedField[] {
    const fields: DetectedField[] = [];
    const seen = new Set<Element>();

    const candidates = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"], [role="combobox"]'
    );

    candidates.forEach((el) => {
      if (seen.has(el)) return;
      if (!isVisible(el)) return;

      const field = this.inspect(el);
      if (field) {
        seen.add(el);
        fields.push(field);
      }
    });

    const radioGroups = this.detectRadioGroups(doc, seen);
    const checkboxGroups = this.detectCheckboxGroups(doc, seen);
    fields.push(...radioGroups, ...checkboxGroups);

    // Sort visually: top-to-bottom, left-to-right
    fields.sort((a, b) => {
      const elA = doc.querySelector(a.selector);
      const elB = doc.querySelector(b.selector);
      if (!elA || !elB) return 0;
      const rectA = elA.getBoundingClientRect();
      const rectB = elB.getBoundingClientRect();
      if (Math.abs(rectA.top - rectB.top) < 20) {
        return rectA.left - rectB.left;
      }
      return rectA.top - rectB.top;
    });

    return fields;
  },

  inspect(element: Element): DetectedField | null {
    const tag = element.tagName.toLowerCase();
    const inputType = element.getAttribute('type')?.toLowerCase() || '';
    const selector = this.buildSelector(element);

    let type: FieldType = 'unknown';
    let options: string[] = [];
    let accepts: string | null = null;

    if (tag === 'textarea') {
      type = 'textarea';
    } else if (tag === 'select') {
      type = 'select';
      options = Array.from((element as HTMLSelectElement).options).map((o) => o.text.trim());
    } else if (tag === 'input') {
      switch (inputType) {
        case 'text':
        case 'search':
          type = 'text';
          break;
        case 'email':
          type = 'email';
          break;
        case 'tel':
          type = 'tel';
          break;
        case 'number':
          type = 'number';
          break;
        case 'file':
          type = 'file';
          accepts = element.getAttribute('accept');
          break;
        case 'date':
        case 'datetime-local':
          type = 'date';
          break;
        case 'radio':
          return null;
        case 'checkbox':
          return null;
        default:
          type = 'text';
      }
    } else if (element.getAttribute('contenteditable') === 'true') {
      type = 'richtext';
    } else if (element.getAttribute('role') === 'combobox') {
      type = 'custom-dropdown';
    }

    if (
      element.classList.contains('select__input') ||
      element.classList.contains('select2-search__field') ||
      element.closest('[class*="select-container"]')
    ) {
      type = 'custom-dropdown';
    }

    const label = this.resolveLabel(element);
    const required =
      element.hasAttribute('required') ||
      element.getAttribute('aria-required') === 'true' ||
      label.includes('*') ||
      label.includes('required');

    return {
      selector,
      label: normalize(label),
      type,
      required,
      options,
      placeholder: element.getAttribute('placeholder'),
      max_length: parseInt(element.getAttribute('maxlength') || '0', 10) || 0,
      accepts,
    };
  },

  resolveLabel(element: Element): string {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const id = element.id;
    if (id) {
      const labelEl = element.ownerDocument.querySelector(`label[for="${id}"]`);
      if (labelEl) return labelEl.textContent || '';
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea').forEach((el) => el.remove());
      return clone.textContent || '';
    }

    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;

    const name = element.getAttribute('name');
    if (name) return name;

    const prevText = element.previousSibling?.textContent?.trim();
    if (prevText) return prevText;

    const heading = element.closest('section, fieldset, div')?.querySelector('h1, h2, h3, h4, h5, legend');
    if (heading) return heading.textContent || '';

    return '';
  },

  buildSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    const tag = element.tagName.toLowerCase();
    const name = element.getAttribute('name');
    if (name) return `${tag}[name="${name}"]`;

    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const classes = Array.from(current.classList)
        .filter((c) => !c.includes(':'))
        .join('.');
      const part = classes ? `${tagName}.${classes}` : tagName;
      path.unshift(part);
      current = current.parentElement;
      if (path.length > 4) break;
    }
    return path.join(' > ');
  },

  detectRadioGroups(doc: Document, seen: Set<Element>): DetectedField[] {
    const radios = doc.querySelectorAll('input[type="radio"]');
    const groups = new Map<string, Element[]>();

    radios.forEach((el) => {
      if (seen.has(el)) return;
      const name = el.getAttribute('name');
      if (!name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(el);
    });

    const fields: DetectedField[] = [];
    groups.forEach((elements, name) => {
      elements.forEach((el) => seen.add(el));
      const first = elements[0];
      const label = this.resolveLabel(first);
      const options = elements.map((el) => {
        const id = el.id;
        if (id) {
          const lbl = doc.querySelector(`label[for="${id}"]`);
          if (lbl) return lbl.textContent?.trim() || '';
        }
        const parent = el.closest('label');
        if (parent) {
          const clone = parent.cloneNode(true) as HTMLElement;
          clone.querySelector('input')?.remove();
          return clone.textContent?.trim() || '';
        }
        return el.getAttribute('value') || '';
      });

      fields.push({
        selector: `input[type="radio"][name="${name}"]`,
        label: normalize(label),
        type: 'radio',
        required: first.hasAttribute('required') || first.getAttribute('aria-required') === 'true',
        options: options.filter(Boolean),
        placeholder: null,
        max_length: 0,
        accepts: null,
      });
    });

    return fields;
  },

  detectCheckboxGroups(doc: Document, seen: Set<Element>): DetectedField[] {
    const checkboxes = doc.querySelectorAll('input[type="checkbox"]');
    const groups = new Map<string, Element[]>();
    const singles: Element[] = [];

    checkboxes.forEach((el) => {
      if (seen.has(el)) return;
      const name = el.getAttribute('name');
      if (name) {
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name)!.push(el);
      } else {
        singles.push(el);
      }
    });

    const fields: DetectedField[] = [];

    groups.forEach((elements, name) => {
      elements.forEach((el) => seen.add(el));
      const first = elements[0];
      const label = this.resolveLabel(first);
      const options = elements.map((el) => {
        const id = el.id;
        if (id) {
          const lbl = doc.querySelector(`label[for="${id}"]`);
          if (lbl) return lbl.textContent?.trim() || '';
        }
        const parent = el.closest('label');
        if (parent) {
          const clone = parent.cloneNode(true) as HTMLElement;
          clone.querySelector('input')?.remove();
          return clone.textContent?.trim() || '';
        }
        return el.getAttribute('value') || '';
      });

      fields.push({
        selector: `input[type="checkbox"][name="${name}"]`,
        label: normalize(label),
        type: 'checkbox',
        required: first.hasAttribute('required') || first.getAttribute('aria-required') === 'true',
        options: options.filter(Boolean),
        placeholder: null,
        max_length: 0,
        accepts: null,
      });
    });

    singles.forEach((el) => {
      seen.add(el);
      const label = this.resolveLabel(el);
      fields.push({
        selector: this.buildSelector(el),
        label: normalize(label),
        type: 'checkbox',
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        options: [el.getAttribute('value') || 'on'],
        placeholder: null,
        max_length: 0,
        accepts: null,
      });
    });

    return fields;
  },
};
