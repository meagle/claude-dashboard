import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../Header';

function makeProps(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  return {
    isDetached: false,
    isSettingsOpen: false,
    isHistoryOpen: false,
    isCompact: false,
    alwaysOnTop: true,
    onSettingsToggle: vi.fn(),
    onHistoryToggle: vi.fn(),
    onCompactToggle: vi.fn(),
    onPopout: vi.fn(),
    onPinToggle: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('Header — popover mode', () => {
  it('renders the title', () => {
    render(<Header {...makeProps()} />);
    expect(screen.getByText('🤖 Claude Dashboard')).toBeInTheDocument();
  });

  it('shows popout button', () => {
    render(<Header {...makeProps()} />);
    expect(screen.getByTitle('Open as standalone panel')).toBeInTheDocument();
  });

  it('does not show pin or close buttons', () => {
    render(<Header {...makeProps()} />);
    expect(screen.queryByTitle(/Always on top/)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Close panel')).not.toBeInTheDocument();
  });

  it('calls onPopout when popout button is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Open as standalone panel'));
    expect(props.onPopout).toHaveBeenCalledOnce();
  });
});

describe('Header — detached mode', () => {
  it('does not show popout button', () => {
    render(<Header {...makeProps({ isDetached: true })} />);
    expect(screen.queryByTitle('Open as standalone panel')).not.toBeInTheDocument();
  });

  it('shows pin and close buttons', () => {
    render(<Header {...makeProps({ isDetached: true })} />);
    expect(screen.getByTitle(/Always on top/)).toBeInTheDocument();
    expect(screen.getByTitle('Close panel')).toBeInTheDocument();
  });

  it('calls onPinToggle when pin button is clicked', () => {
    const props = makeProps({ isDetached: true });
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle(/Always on top/));
    expect(props.onPinToggle).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    const props = makeProps({ isDetached: true });
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Close panel'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});

describe('Header — compact toggle', () => {
  it('shows "Switch to compact view" when not compact', () => {
    render(<Header {...makeProps({ isCompact: false })} />);
    expect(screen.getByTitle('Switch to compact view')).toBeInTheDocument();
  });

  it('shows "Switch to card view" when compact', () => {
    render(<Header {...makeProps({ isCompact: true })} />);
    expect(screen.getByTitle('Switch to card view')).toBeInTheDocument();
  });

  it('calls onCompactToggle when compact button is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Switch to compact view'));
    expect(props.onCompactToggle).toHaveBeenCalledOnce();
  });
});

describe('Header — settings and history', () => {
  it('calls onSettingsToggle when settings button is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(props.onSettingsToggle).toHaveBeenCalledOnce();
  });

  it('shows "Session history" button when history is closed', () => {
    render(<Header {...makeProps({ isHistoryOpen: false })} />);
    expect(screen.getByTitle('Session history')).toBeInTheDocument();
  });

  it('shows "Back to sessions" button when history is open', () => {
    render(<Header {...makeProps({ isHistoryOpen: true })} />);
    expect(screen.getByTitle('Back to sessions')).toBeInTheDocument();
  });

  it('calls onHistoryToggle when history button is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Session history'));
    expect(props.onHistoryToggle).toHaveBeenCalledOnce();
  });
});
