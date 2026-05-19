import { describe, it, expect } from 'vitest';
import {
  normalize,
  fuzzyMatch,
  findClosest,
  parseFileSizeLimit,
  generateUUID,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from '../lib/utils.js';

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Hello World  ')).toBe('hello world');
  });

  it('removes punctuation', () => {
    expect(normalize('E-mail Address:')).toBe('email address');
  });

  it('handles null/undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('fuzzyMatch', () => {
  it('matches substrings', () => {
    expect(fuzzyMatch('First Name', 'name')).toBe(true);
    expect(fuzzyMatch('Email Address', 'email')).toBe(true);
  });

  it('rejects unrelated strings', () => {
    expect(fuzzyMatch('Phone', 'Name')).toBe(false);
  });
});

describe('findClosest', () => {
  it('finds exact match', () => {
    expect(findClosest('India', ['USA', 'India', 'UK'])).toBe('India');
  });

  it('finds closest by Levenshtein', () => {
    expect(findClosest('Inda', ['USA', 'India', 'UK'])).toBe('India');
  });
});

describe('parseFileSizeLimit', () => {
  it('parses MB', () => {
    expect(parseFileSizeLimit('Max 2MB')).toBe(2097152);
  });

  it('parses KB', () => {
    expect(parseFileSizeLimit('500 KB max')).toBe(512000);
  });

  it('returns null when not found', () => {
    expect(parseFileSizeLimit('Upload your resume')).toBeNull();
  });
});

describe('generateUUID', () => {
  it('returns a valid UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns unique values', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('base64 roundtrip', () => {
  it('converts ArrayBuffer to base64 and back', () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const b64 = arrayBufferToBase64(bytes.buffer);
    const back = base64ToArrayBuffer(b64);
    expect(new Uint8Array(back)).toEqual(bytes);
  });
});
