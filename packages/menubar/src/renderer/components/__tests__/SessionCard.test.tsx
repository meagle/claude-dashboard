import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionCard } from '../SessionCard';
import { makeSession, defaultCardConfig } from './testUtils';


beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});

const HOME = '/Users/alice';

function renderCard(overrides: Parameters<typeof makeSession>[0] = {}, configOverrides: Partial<typeof defaultCardConfig> = {}) {
  const session = makeSession(overrides);
  const cardConfig = { ...defaultCardConfig, ...configOverrides };
  const onFocus = vi.fn();
  const onDismiss = vi.fn();
  const onCopyPath = vi.fn();
  const result = render(
    <SessionCard
      session={session}
      cardConfig={cardConfig}
      home={HOME}
      isNew={false}
      onFocus={onFocus}
      onDismiss={onDismiss}
      onCopyPath={onCopyPath}
    />
  );
  return { ...result, onFocus, onDismiss, onCopyPath, session };
}

describe('SessionCard — done', () => {
  it('shows prompt and answer', () => {
    renderCard({
      status: 'done',
      lastPrompt: 'Write a test',
      lastMessage: 'Here is a test.',
    });
    expect(screen.getByText(/Write a test/)).toBeInTheDocument();
    expect(screen.getByText(/Here is a test\./)).toBeInTheDocument();
  });

  it('shows dismiss button', () => {
    renderCard({ status: 'done' });
    expect(screen.getByTitle('Dismiss')).toBeInTheDocument();
  });

  it('calls onDismiss with sessionId when dismiss clicked', () => {
    const { onDismiss, session } = renderCard({ status: 'done' });
    fireEvent.click(screen.getByTitle('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(session.sessionId);
  });

  it('shows cost badge when showCost is true and costUsd is set', () => {
    renderCard({ status: 'done', costUsd: 0.0123 }, { showCost: true });
    expect(screen.getByText('$0.0123')).toBeInTheDocument();
  });

  it('does not show cost badge when showCost is false', () => {
    renderCard({ status: 'done', costUsd: 0.0123 }, { showCost: false });
    expect(screen.queryByText(/\$0\./)).not.toBeInTheDocument();
  });
});

describe('SessionCard — active', () => {
  it('does not show dismiss button', () => {
    renderCard({ status: 'active' });
    // Button is always rendered for layout consistency but invisible on non-done cards
    const btn = screen.queryByTitle('Dismiss');
    expect(btn).toBeInTheDocument();
    expect(btn!.className).toContain('invisible');
  });

  it('shows current tool as stream row', () => {
    renderCard({
      status: 'active',
      lastPrompt: 'Do something',
      currentTool: 'Bash',
      lastToolSummary: 'git status',
    });
    expect(screen.getByText(/🔧 Bash/)).toBeInTheDocument();
    expect(screen.getByText(/git status/)).toBeInTheDocument();
  });

  it('does not show lastMessage on active cards', () => {
    renderCard({
      status: 'active',
      lastPrompt: 'New task',
      lastMessage: 'Old response from previous turn',
    });
    expect(screen.queryByText(/Old response/)).not.toBeInTheDocument();
  });

  it('shows partial response when no current tool', () => {
    renderCard({
      status: 'active',
      lastPrompt: 'Do something',
      partialResponse: 'I will help with that',
    });
    expect(screen.getByText(/I will help with that/)).toBeInTheDocument();
  });

  it('prioritizes currentTool over partialResponse', () => {
    renderCard({
      status: 'active',
      lastPrompt: 'Do something',
      currentTool: 'Read',
      partialResponse: 'Some partial text',
    });
    expect(screen.getByText(/🔧 Read/)).toBeInTheDocument();
    expect(screen.queryByText(/Some partial text/)).not.toBeInTheDocument();
  });
});

describe('SessionCard — waiting', () => {
  it('shows alert for waiting_permission', () => {
    renderCard({ status: 'waiting_permission', lastPrompt: 'Do something' });
    expect(screen.getByText(/Waiting for tool approval/)).toBeInTheDocument();
  });

  it('shows alert for waiting_input', () => {
    renderCard({ status: 'waiting_input', lastPrompt: 'Do something' });
    expect(screen.getByText(/Awaiting answer/)).toBeInTheDocument();
  });
});

describe('SessionCard — copy path', () => {
  it('calls onCopyPath with full workingDir', () => {
    const { onCopyPath } = renderCard({
      workingDir: '/Users/alice/code/myproject',
    });
    fireEvent.click(screen.getByTitle('Copy: /Users/alice/code/myproject'));
    expect(onCopyPath).toHaveBeenCalledWith('/Users/alice/code/myproject');
  });

  it('shows ✓ flash after clicking copy icon', async () => {
    renderCard({ workingDir: '/Users/alice/code/myproject' });
    fireEvent.click(screen.getByTitle('Copy: /Users/alice/code/myproject'));
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});

describe('SessionCard — focus', () => {
  it('calls onFocus when card clicked', () => {
    const { onFocus, session, container } = renderCard({ status: 'active' });
    fireEvent.click(container.querySelector('[data-session]')!);
    expect(onFocus).toHaveBeenCalledWith(session.pid, session.termSessionId);
  });
});

describe('SessionCard — context bar', () => {
  it('shows context bar when contextPct is set and showModel is true', () => {
    const { container } = renderCard({ model: 'Sonnet 4.6', contextPct: 42 }, { showModel: true });
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(container.querySelector('[style*="width: 42%"]')).not.toBeNull();
  });

  it('does not show context bar when contextPct is null', () => {
    renderCard({ model: 'Sonnet 4.6', contextPct: null }, { showModel: true });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('does not show context bar when showModel is false', () => {
    renderCard({ model: 'Sonnet 4.6', contextPct: 50 }, { showModel: false });
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('shows model badge when model is set and showModel is true', () => {
    renderCard({ status: 'done', model: 'Sonnet 4.6' }, { showModel: true, showDoneFooter: true });
    expect(screen.getByText('Sonnet 4.6')).toBeInTheDocument();
  });
});

describe('SessionCard — idle state', () => {
  it('shows last tool with ago time when session is idle with a lastTool', () => {
    renderCard({
      status: 'idle',
      lastTool: 'Bash',
      lastToolAt: Date.now() - 120000,
    });
    expect(screen.getByText(/🔧 Bash/)).toBeInTheDocument();
    expect(screen.getByText(/2m ago/)).toBeInTheDocument();
  });

  it('shows last message when idle and no tool running', () => {
    renderCard({
      status: 'idle',
      lastMessage: 'I finished the task.',
    });
    expect(screen.getByText(/I finished the task\./)).toBeInTheDocument();
  });
});

describe('SessionCard — loop detection', () => {
  it('shows loop count when errorState is true', () => {
    renderCard({
      status: 'active',
      lastPrompt: 'Do something',
      currentTool: 'Bash',
      errorState: true,
      loopTool: 'Bash',
      loopCount: 6,
    });
    expect(screen.getByText(/×6 loop/)).toBeInTheDocument();
  });
});

describe('SessionCard — branch and git', () => {
  it('shows branch when showBranch is true', () => {
    renderCard({ branch: 'feature/auth', status: 'active', lastPrompt: 'task' }, { showBranch: true });
    expect(screen.getByText('feature/auth')).toBeInTheDocument();
  });

  it('hides branch when showBranch is false', () => {
    renderCard({ branch: 'feature/auth', status: 'active', lastPrompt: 'task' }, { showBranch: false });
    expect(screen.queryByText('feature/auth')).not.toBeInTheDocument();
  });

  it('shows git summary when showGitSummary is true', () => {
    renderCard({ gitSummary: '3 files +42 -7', status: 'active', lastPrompt: 'task' }, { showGitSummary: true });
    expect(screen.getByText(/3 files/)).toBeInTheDocument();
  });
});

describe('SessionCard — flash animation', () => {
  it('applies flash animation when isNew is true', () => {
    const session = makeSession({ sessionId: 'a', status: 'done' });
    const { container } = render(
      <SessionCard
        session={session}
        cardConfig={defaultCardConfig}
        home={HOME}
        isNew={true}
        onFocus={vi.fn()}
        onDismiss={vi.fn()}
        onCopyPath={vi.fn()}
      />
    );
    expect(container.querySelector('[data-session]')!.className).toContain('animate-flash');
  });

  it('does not apply flash animation when isNew is false', () => {
    const { container } = renderCard({ status: 'done' });
    expect(container.querySelector('[data-session]')!.className).not.toContain('animate-flash');
  });
});
