import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header, ViewMode } from '../Header';

function makeProps(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  return {
    isDetached: false,
    isSettingsOpen: false,
    isHistoryOpen: false,
    viewMode: 'card' as ViewMode,
    alwaysOnTop: true,
    onSettingsToggle: vi.fn(),
    onHistoryToggle: vi.fn(),
    onViewModeChange: vi.fn(),
    onPopout: vi.fn(),
    onPinToggle: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('Header — popover mode', () => {
  it('renders the title', () => {
    render(<Header {...makeProps()} />);
    expect(screen.getByText('Claude')).toBeInTheDocument();
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

describe('Header — view mode toggle', () => {
  it('shows "Switch to compact view" in card mode', () => {
    render(<Header {...makeProps({ viewMode: 'card' })} />);
    expect(screen.getByTitle('Switch to compact view')).toBeInTheDocument();
  });

  it('shows "Switch to card view" in compact mode', () => {
    render(<Header {...makeProps({ viewMode: 'compact' })} />);
    expect(screen.getByTitle('Switch to card view')).toBeInTheDocument();
  });

  it('calls onViewModeChange when view mode button is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Switch to compact view'));
    expect(props.onViewModeChange).toHaveBeenCalledOnce();
  });
});

describe('Header — settings and history', () => {
  it('always renders all three nav tabs', () => {
    render(<Header {...makeProps()} />);
    expect(screen.getByTitle('Sessions')).toBeInTheDocument();
    expect(screen.getByTitle('Session history')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
  });

  it('sessions tab is active when neither settings nor history is open', () => {
    render(<Header {...makeProps({ isHistoryOpen: false, isSettingsOpen: false })} />);
    expect(screen.getByTitle('Sessions')).toHaveClass('text-accent');
    expect(screen.getByTitle('Session history')).not.toHaveClass('text-accent');
    expect(screen.getByTitle('Settings')).not.toHaveClass('text-accent');
  });

  it('history tab is active when isHistoryOpen is true', () => {
    render(<Header {...makeProps({ isHistoryOpen: true })} />);
    expect(screen.getByTitle('Session history')).toHaveClass('text-accent');
    expect(screen.getByTitle('Sessions')).not.toHaveClass('text-accent');
  });

  it('settings tab is active when isSettingsOpen is true', () => {
    render(<Header {...makeProps({ isSettingsOpen: true })} />);
    expect(screen.getByTitle('Settings')).toHaveClass('text-accent');
    expect(screen.getByTitle('Sessions')).not.toHaveClass('text-accent');
  });

  it('calls onSettingsToggle when settings tab is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(props.onSettingsToggle).toHaveBeenCalledOnce();
  });

  it('calls onHistoryToggle when history tab is clicked', () => {
    const props = makeProps();
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Session history'));
    expect(props.onHistoryToggle).toHaveBeenCalledOnce();
  });

  it('clicking sessions tab when history is open calls onHistoryToggle', () => {
    const props = makeProps({ isHistoryOpen: true });
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Sessions'));
    expect(props.onHistoryToggle).toHaveBeenCalledOnce();
    expect(props.onSettingsToggle).not.toHaveBeenCalled();
  });

  it('clicking sessions tab when settings is open calls onSettingsToggle', () => {
    const props = makeProps({ isSettingsOpen: true });
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Sessions'));
    expect(props.onSettingsToggle).toHaveBeenCalledOnce();
    expect(props.onHistoryToggle).not.toHaveBeenCalled();
  });

  it('clicking sessions tab when neither is open does nothing', () => {
    const props = makeProps({ isHistoryOpen: false, isSettingsOpen: false });
    render(<Header {...props} />);
    fireEvent.click(screen.getByTitle('Sessions'));
    expect(props.onHistoryToggle).not.toHaveBeenCalled();
    expect(props.onSettingsToggle).not.toHaveBeenCalled();
  });
});
