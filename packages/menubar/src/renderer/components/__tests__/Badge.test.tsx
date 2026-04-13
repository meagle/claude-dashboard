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
  it('renders ACTIVE badge', () => {
    render(<Badge status="active" {...base} />);
    expect(screen.getByText(/● ACTIVE/)).toBeInTheDocument();
  });

  it('renders PERMISSION badge', () => {
    render(<Badge status="waiting_permission" {...base} />);
    expect(screen.getByText(/● PERMISSION/)).toBeInTheDocument();
  });

  it('renders INPUT badge', () => {
    render(<Badge status="waiting_input" {...base} />);
    expect(screen.getByText(/● INPUT/)).toBeInTheDocument();
  });

  it('renders IDLE badge', () => {
    render(<Badge status="idle" {...base} />);
    expect(screen.getByText(/○ IDLE/)).toBeInTheDocument();
  });

  it('renders DONE badge with elapsed time', () => {
    render(<Badge status="done" {...base} />);
    expect(screen.getByText(/● DONE/)).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
  });

  it('appends LOOP badge when errorState is true', () => {
    render(<Badge status="active" {...base} errorState={true} loopTool="Bash" loopCount={6} />);
    expect(screen.getByText(/LOOP/)).toBeInTheDocument();
    expect(screen.getByText(/Bash/)).toBeInTheDocument();
    expect(screen.getByText(/×6/)).toBeInTheDocument();
  });

  it('shows LOOP without tool info when loopTool is null', () => {
    render(<Badge status="active" {...base} errorState={true} />);
    expect(screen.getByText(/LOOP/)).toBeInTheDocument();
  });

  it('does not render LOOP badge when errorState is false', () => {
    render(<Badge status="active" {...base} />);
    expect(screen.queryByText(/LOOP/)).not.toBeInTheDocument();
  });
});
