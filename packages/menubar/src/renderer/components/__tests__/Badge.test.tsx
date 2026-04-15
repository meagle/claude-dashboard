import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

let base: { lastActivity: number; errorState: boolean; loopTool: string | null; loopCount: number };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  base = {
    lastActivity: Date.now() - 5 * 60_000,
    errorState: false,
    loopTool: null,
    loopCount: 0,
  };
});

describe('Badge', () => {
  it('renders ACTIVE badge with filled circle', () => {
    const { container } = render(<Badge status="active" {...base} />);
    expect(container.querySelector('span')?.textContent).toBe('●');
  });

  it('renders PERMISSION badge with filled circle', () => {
    const { container } = render(<Badge status="waiting_permission" {...base} />);
    expect(container.querySelector('span')?.textContent).toBe('●');
  });

  it('renders INPUT badge with filled circle', () => {
    const { container } = render(<Badge status="waiting_input" {...base} />);
    expect(container.querySelector('span')?.textContent).toBe('●');
  });

  it('renders IDLE badge with hollow circle', () => {
    const { container } = render(<Badge status="idle" {...base} />);
    expect(container.querySelector('span')?.textContent).toBe('○');
  });

  it('renders DONE badge with filled circle', () => {
    const { container } = render(<Badge status="done" {...base} />);
    expect(container.querySelector('span')?.textContent).toBe('●');
  });

  it('renders only the circle when errorState is true (LOOP is rendered by SessionCard)', () => {
    const { container } = render(<Badge status="active" {...base} errorState={true} loopTool="Bash" loopCount={6} />);
    expect(container.querySelector('span')?.textContent).toBe('●');
    expect(container.textContent).not.toContain('LOOP');
  });
});
