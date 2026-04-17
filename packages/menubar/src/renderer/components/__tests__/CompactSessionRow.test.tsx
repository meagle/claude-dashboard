import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompactSessionRow } from '../CompactSessionRow';
import { makeSession, defaultCardConfig } from './testUtils';

function renderRow(overrides: Parameters<typeof makeSession>[0] = {}) {
  const session = makeSession(overrides);
  const onFocus = vi.fn();
  const { container } = render(
    <CompactSessionRow session={session} cardConfig={defaultCardConfig} home="/Users/alice" onFocus={onFocus} />
  );
  return { session, onFocus, container };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});

describe('CompactSessionRow — content', () => {
  it('renders dirName', () => {
    renderRow({ dirName: 'my-project' });
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('renders branch when showBranch is true', () => {
    renderRow({ branch: 'feature/new-ui' });
    expect(screen.getByText(/feature\/new-ui/)).toBeInTheDocument();
  });

  it('does not render branch when showBranch is false', () => {
    const { container } = render(
      <CompactSessionRow
        session={makeSession({ branch: 'main' })}
        cardConfig={{ ...defaultCardConfig, showBranch: false }}
        home=""
        onFocus={vi.fn()}
      />
    );
    expect(container).not.toHaveTextContent('main');
  });

  it('renders task text from lastPrompt', () => {
    renderRow({ lastPrompt: 'Write some tests' });
    expect(screen.getByText('Write some tests')).toBeInTheDocument();
  });

  it('prefers currentTask over lastPrompt when active', () => {
    renderRow({ status: 'active', currentTask: 'Active task', lastPrompt: 'Old prompt' });
    expect(screen.getByText('Active task')).toBeInTheDocument();
    expect(screen.queryByText('Old prompt')).not.toBeInTheDocument();
  });

  it('shows lastMessage instead of prompt when done', () => {
    renderRow({ status: 'done', lastPrompt: 'Write a test', lastMessage: 'Here is the test.' });
    expect(screen.getByText('Here is the test.')).toBeInTheDocument();
    expect(screen.queryByText('Write a test')).not.toBeInTheDocument();
  });

  it('falls back to lastPrompt when done and no lastMessage', () => {
    renderRow({ status: 'done', lastPrompt: 'Write a test', lastMessage: null });
    expect(screen.getByText('Write a test')).toBeInTheDocument();
  });

  it('renders context percentage when contextPct is set', () => {
    renderRow({ contextPct: 45 });
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('does not render context percentage when contextPct is null', () => {
    renderRow({ contextPct: null });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe('CompactSessionRow — time label', () => {
  it('shows elapsed time for active session', () => {
    renderRow({ status: 'active', turnStartedAt: Date.now() - 65000 });
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('shows ago time for done session', () => {
    renderRow({ status: 'done', lastActivity: Date.now() - 120000 });
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });
});

describe('CompactSessionRow — context dot color', () => {
  it('uses fill color for context < 60%', () => {
    const { container } = renderRow({ contextPct: 50 });
    expect(container.querySelector('.text-ctx-fill')).not.toBeNull();
  });

  it('uses warn color for context between 60% and 79%', () => {
    const { container } = renderRow({ contextPct: 70 });
    expect(container.querySelector('.text-ctx-warn')).not.toBeNull();
  });

  it('uses crit color for context >= 80%', () => {
    const { container } = renderRow({ contextPct: 85 });
    expect(container.querySelector('.text-ctx-crit')).not.toBeNull();
  });

  it('uses crit color at exactly 80%', () => {
    const { container } = renderRow({ contextPct: 80 });
    expect(container.querySelector('.text-ctx-crit')).not.toBeNull();
  });

  it('uses warn color at exactly 60%', () => {
    const { container } = renderRow({ contextPct: 60 });
    expect(container.querySelector('.text-ctx-warn')).not.toBeNull();
  });
});

describe('CompactSessionRow — interaction', () => {
  it('calls onFocus with pid and termSessionId when row is clicked', () => {
    const { onFocus } = renderRow({ pid: 42, termSessionId: 'term-abc' });
    fireEvent.click(screen.getByText('myproject'));
    expect(onFocus).toHaveBeenCalledWith(42, 'term-abc');
  });

  it('calls onFocus with null termSessionId when none set', () => {
    const { onFocus } = renderRow({ pid: 7, termSessionId: null });
    fireEvent.click(screen.getByText('myproject'));
    expect(onFocus).toHaveBeenCalledWith(7, null);
  });
});
