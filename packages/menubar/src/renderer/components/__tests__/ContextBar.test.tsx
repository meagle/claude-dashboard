import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextBar } from '../ContextBar';

describe('ContextBar', () => {
  it('shows the percentage', () => {
    render(<ContextBar pct={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('uses normal fill class below 60%', () => {
    const { container } = render(<ContextBar pct={59} />);
    const fill = container.querySelector('.ctx-fill');
    expect(fill).toBeInTheDocument();
    expect(fill!.className).toBe('ctx-fill');
  });

  it('uses warn class at 60%', () => {
    const { container } = render(<ContextBar pct={60} />);
    expect(container.querySelector('.ctx-fill.warn')).toBeInTheDocument();
  });

  it('uses crit class at 80%', () => {
    const { container } = render(<ContextBar pct={80} />);
    expect(container.querySelector('.ctx-fill.crit')).toBeInTheDocument();
  });

  it('sets width style to pct%', () => {
    const { container } = render(<ContextBar pct={45} />);
    const fill = container.querySelector('.ctx-fill') as HTMLElement;
    expect(fill.style.width).toBe('45%');
  });
});
