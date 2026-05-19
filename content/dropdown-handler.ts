import { randomDelay } from '../lib/wait.js';
import { normalize } from '../lib/utils.js';


// ═══════════════════════════════════════════════════════════════
// Dropdown Handler — Native selects + custom searchable dropdowns
// PRD Reference: Section 16 (Custom Dropdown Handling)
// ═══════════════════════════════════════════════════════════════

export const dropdownHandler = {
  async fillNative(select: HTMLSelectElement, value: string): Promise<boolean> {
    select.focus();
    select.value = value;

    if (!select.value && select.options.length > 0) {
      const target = normalize(value);
      let bestOption: HTMLOptionElement | null = null;
      let bestScore = Infinity;

      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        const optText = normalize(opt.text);
        const optValue = normalize(opt.value);

        if (optText === target || optValue === target) {
          bestOption = opt;
          break;
        }
        const score = levenshtein(optText, target);
        if (score < bestScore) {
          bestScore = score;
          bestOption = opt;
        }
      }

      if (bestOption) {
        select.value = bestOption.value;
      }
    }

    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.blur();
    return !!select.value;
  },

  async fillCustomDropdown(element: HTMLElement, value: string): Promise<boolean> {
    const input = element.querySelector('input') ?? (element as HTMLInputElement);
    if (!input) return false;

    const container =
      element.closest('[class*="control"], [class*="container"]') ||
      element.closest('[class*="select"]') ||
      element.parentElement;

    if (container) {
      (container as HTMLElement).click();
      await randomDelay(200, 400);
    }

    (input as HTMLInputElement).focus();
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await randomDelay(300, 500);

    const menu = document.querySelector(
      '[class*="menu"], [class*="dropdown"], [role="listbox"]'
    );
    if (!menu) return false;

    const options = menu.querySelectorAll('[class*="option"], [role="option"]');
    const target = normalize(value);

    for (const opt of Array.from(options)) {
      const text = normalize(opt.textContent || '');
      if (text === target || text.includes(target)) {
        (opt as HTMLElement).click();
        await randomDelay(100, 200);
        return true;
      }
    }

    return false;
  },

  isCustomDropdown(element: Element): boolean {
    return (
      element.getAttribute('role') === 'combobox' ||
      element.classList.contains('select__input') ||
      element.classList.contains('select2-search__field') ||
      !!element.closest('[class*="select-container"]')
    );
  },
};

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}
