import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from '../Badge';

let base: { lastActivity: number };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  base = {
    lastActivity: Date.now() - 5 * 60_000,
  };
});

describe('Badge', () => {
  it('renders ACTIVE badge with filled SVG circle', () => {
    const { container } = render(<Badge status="active" {...base} />);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
  });

  it('renders PERMISSION badge with filled SVG circle', () => {
    const { container } = render(<Badge status="waiting_permission" {...base} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
  });

  it('renders INPUT badge with filled SVG circle', () => {
    const { container } = render(<Badge status="waiting_input" {...base} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
  });

  it('renders IDLE badge with hollow SVG circle', () => {
    const { container } = render(<Badge status="idle" {...base} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('none');
  });

  it('renders DONE badge with filled SVG circle', () => {
    const { container } = render(<Badge status="done" {...base} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
  });

  it('renders only the circle (LOOP is rendered by SessionCard, not Badge)', () => {
    const { container } = render(<Badge status="active" {...base} />);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.textContent).not.toContain('LOOP');
  });
});
