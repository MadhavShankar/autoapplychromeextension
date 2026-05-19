import { delay } from '../lib/wait.js';
import type { DetectedField } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Dynamic Watcher — MutationObserver for conditional fields
// PRD Reference: Section 17 (Dynamic / Conditional Fields)
// ═══════════════════════════════════════════════════════════════

export const dynamicWatcher = {
  async watchForNewFields(
    doc: Document,
    processedSelectors: Set<string>
  ): Promise<DetectedField[]> {
    const newFields: DetectedField[] = [];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const addedNodes = Array.from(mutation.addedNodes).filter(
          (n): n is Element => n.nodeType === Node.ELEMENT_NODE
        );

        for (const node of addedNodes) {
          const inputs = node.matches('input, textarea, select, [contenteditable], [role="combobox"]')
            ? [node]
            : Array.from(node.querySelectorAll('input, textarea, select, [contenteditable], [role="combobox"]'));

          for (const input of inputs) {
            const style = window.getComputedStyle(input);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const selector = this.buildSelector(input);
            if (processedSelectors.has(selector)) continue;

            const field = this.quickInspect(input);
            if (field) newFields.push(field);
          }
        }

        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          const style = window.getComputedStyle(target);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const selector = this.buildSelector(target);
            if (!processedSelectors.has(selector)) {
              const field = this.quickInspect(target);
              if (field) newFields.push(field);
            }
          }
        }
      }
    });

    const formContainer = doc.querySelector('form, [class*="application"], [class*="form"]') || doc.body;
    observer.observe(formContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
    });

    await delay(800);
    observer.disconnect();

    return newFields;
  },

  quickInspect(element: Element): DetectedField | null {
    const tag = element.tagName.toLowerCase();
    const inputType = element.getAttribute('type')?.toLowerCase() || '';

    let type: DetectedField['type'] = 'unknown';
    if (tag === 'textarea') type = 'textarea';
    else if (tag === 'select') type = 'select';
    else if (tag === 'input') {
      if (inputType === 'email') type = 'email';
      else if (inputType === 'tel') type = 'tel';
      else if (inputType === 'number') type = 'number';
      else if (inputType === 'file') type = 'file';
      else if (inputType === 'date') type = 'date';
      else if (inputType === 'text') type = 'text';
    } else if (element.getAttribute('contenteditable') === 'true') {
      type = 'richtext';
    } else if (element.getAttribute('role') === 'combobox') {
      type = 'custom-dropdown';
    }

    if (type === 'unknown') return null;

    const label = this.resolveLabel(element);
    return {
      selector: this.buildSelector(element),
      label: label.toLowerCase().trim(),
      type,
      required:
        element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      options: tag === 'select' ? Array.from((element as HTMLSelectElement).options).map((o) => o.text.trim()) : [],
      placeholder: element.getAttribute('placeholder'),
      max_length: parseInt(element.getAttribute('maxlength') || '0', 10) || 0,
      accepts: inputType === 'file' ? element.getAttribute('accept') : null,
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
    const classes = Array.from(element.classList)
      .filter((c) => !c.includes(':'))
      .join('.');
    return classes ? `${tag}.${classes}` : tag;
  },
};
