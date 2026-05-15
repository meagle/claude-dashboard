import { describe, it, expect } from 'vitest';
import { accentColor, dotColor } from './statusColors';
import { SessionRow } from '../types';

type Status = SessionRow['status'];
const STATUSES: Status[] = ['active', 'waiting_permission', 'waiting_input', 'done', 'idle'];

describe('accentColor', () => {
  it('returns status-based color even when errorState is true', () => {
    expect(accentColor('active', true)).toBe('bg-branch');
    expect(accentColor('done', true)).toBe('bg-badge-done');
    expect(accentColor('waiting_permission', true)).toBe('bg-badge-waiting');
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
  it('returns status-based color even when errorState is true', () => {
    expect(dotColor('active', true)).toBe('text-badge-active');
    expect(dotColor('done', true)).toBe('text-badge-done');
    expect(dotColor('waiting_permission', true)).toBe('text-badge-waiting');
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
