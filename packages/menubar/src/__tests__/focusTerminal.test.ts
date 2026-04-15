import { describe, it, expect } from 'vitest';
import { sanitizeGuid, focusTerminal, findParentApp } from '../focusTerminal';

describe('sanitizeGuid', () => {
  it('extracts the part after the colon', () => {
    expect(sanitizeGuid('w0t0p0:ABC-123_def')).toBe('ABC-123_def');
  });

  it('uses the whole string when there is no colon', () => {
    expect(sanitizeGuid('ABC-123_def')).toBe('ABC-123_def');
  });

  it('strips double-quotes that would break AppleScript string interpolation', () => {
    const result = sanitizeGuid('w0t0p0:abc"def');
    expect(result).not.toContain('"');
    expect(result).toBe('abcdef');
  });

  it('strips newlines that would break AppleScript string interpolation', () => {
    const result = sanitizeGuid('bad\nguid');
    expect(result).not.toContain('\n');
    expect(result).toBe('badguid');
  });

  it('returns empty string for all-special-character input', () => {
    expect(sanitizeGuid('!!!')).toBe('');
    expect(sanitizeGuid('w0t0p0:!!!')).toBe('');
  });

  it('preserves allowed characters: alphanumeric, hyphen, underscore', () => {
    expect(sanitizeGuid('ABC-123_xyz')).toBe('ABC-123_xyz');
  });
});

describe('findParentApp', () => {
  it('returns null for pid 0', () => {
    expect(findParentApp(0)).toBeNull();
  });

  it('returns null for a nonsense pid', () => {
    expect(findParentApp(999999999)).toBeNull();
  });
});

describe('focusTerminal', () => {
  it('does not throw for zero pid with no termSessionId', () => {
    expect(() => focusTerminal(0, null)).not.toThrow();
  });

  it('does not throw when guid sanitizes to empty string', () => {
    expect(() => focusTerminal(123, '!!!')).not.toThrow();
  });
});
