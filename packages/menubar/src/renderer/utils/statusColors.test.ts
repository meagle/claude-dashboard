import { describe, it, expect } from 'vitest';
import { accentColor, dotColor } from './statusColors';
import { SessionRow } from '../types';

type Status = SessionRow['status'];
const STATUSES: Status[] = ['active', 'waiting_permission', 'waiting_input', 'done', 'idle'];

describe('accentColor', () => {
  it('returns loop color when errorState is true, regardless of status', () => {
    for (const status of STATUSES) {
      expect(accentColor(status, true)).toBe('bg-badge-loop');
    }
  });

  it('returns waiting color for waiting_permission', () => {
    expect(accentColor('waiting_permission', false)).toBe('bg-badge-waiting');
  });

  it('returns waiting color for waiting_input', () => {
    expect(accentColor('waiting_input', false)).toBe('bg-badge-waiting');
  });

  it('returns branch (green) color for active', () => {
    expect(accentColor('active', false)).toBe('bg-branch');
  });

  it('returns done (neutral) color for done', () => {
    expect(accentColor('done', false)).toBe('bg-badge-done');
  });

  it('returns accent color for idle', () => {
    expect(accentColor('idle', false)).toBe('bg-accent');
  });
});

describe('dotColor', () => {
  it('returns loop color when errorState is true, regardless of status', () => {
    for (const status of STATUSES) {
      expect(dotColor(status, true)).toBe('text-badge-loop');
    }
  });

  it('returns waiting color for waiting_permission', () => {
    expect(dotColor('waiting_permission', false)).toBe('text-badge-waiting');
  });

  it('returns waiting color for waiting_input', () => {
    expect(dotColor('waiting_input', false)).toBe('text-badge-waiting');
  });

  it('returns active (bright green) color for active — not the accent-bar green', () => {
    expect(dotColor('active', false)).toBe('text-badge-active');
  });

  it('returns done color for done', () => {
    expect(dotColor('done', false)).toBe('text-badge-done');
  });

  it('returns accent color for idle', () => {
    expect(dotColor('idle', false)).toBe('text-accent');
  });
});
