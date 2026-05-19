import { describe, it, expect, beforeEach } from 'vitest';
import { fieldDetector } from '../content/field-detector.js';

// Minimal DOM setup for jsdom
describe('fieldDetector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects text input', () => {
    document.body.innerHTML = `
      <form>
        <label for="name">Full Name</label>
        <input type="text" id="name" name="name" required />
      </form>
    `;
    const fields = fieldDetector.detect(document);
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('text');
    expect(fields[0].label).toBe('full name');
    expect(fields[0].required).toBe(true);
  });

  it('detects email input', () => {
    document.body.innerHTML = `
      <form>
        <input type="email" name="email" placeholder="Work Email" />
      </form>
    `;
    const fields = fieldDetector.detect(document);
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('email');
    expect(fields[0].label).toBe('work email');
  });

  it('detects select element', () => {
    document.body.innerHTML = `
      <form>
        <label>Country
          <select name="country">
            <option>India</option>
            <option>USA</option>
          </select>
        </label>
      </form>
    `;
    const fields = fieldDetector.detect(document);
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('select');
    expect(fields[0].options).toEqual(['India', 'USA']);
  });

  it('detects radio group', () => {
    document.body.innerHTML = `
      <form>
        <p>Gender</p>
        <input type="radio" name="gender" value="male" id="m" />
        <label for="m">Male</label>
        <input type="radio" name="gender" value="female" id="f" />
        <label for="f">Female</label>
      </form>
    `;
    const fields = fieldDetector.detect(document);
    const radioField = fields.find((f) => f.type === 'radio');
    expect(radioField).toBeDefined();
    expect(radioField!.options).toContain('Male');
    expect(radioField!.options).toContain('Female');
  });

  it('ignores hidden inputs', () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="csrf" />
        <input type="text" name="visible" />
      </form>
    `;
    const fields = fieldDetector.detect(document);
    expect(fields.length).toBe(1);
    expect(fields[0].type).toBe('text');
  });

  it('sorts fields visually', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="second" style="position:absolute; top: 100px;" />
        <input type="text" name="first" style="position:absolute; top: 10px;" />
      </form>
    `;
    const fields = fieldDetector.detect(document);
    // Should be sorted top-to-bottom
    expect(fields[0].selector).toContain('first');
    expect(fields[1].selector).toContain('second');
  });
});
